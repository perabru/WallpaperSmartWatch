package br.com.perabru.raccoonstudio;

import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.jieli.jl_rcsp.constant.JLChipFlag;
import com.jieli.jl_rcsp.constant.StateCode;
import com.jieli.jl_rcsp.impl.RcspAuth;
import com.jieli.jl_rcsp.impl.WatchOpImpl;
import com.jieli.jl_rcsp.interfaces.watch.OnWatchCallback;
import com.jieli.jl_rcsp.interfaces.watch.OnWatchOpCallback;
import com.jieli.jl_rcsp.model.WatchConfigure;
import com.jieli.jl_rcsp.model.base.BaseError;
import com.jieli.jl_rcsp.model.device.DeviceInfo;
import com.jieli.jl_rcsp.model.response.ExternalFlashMsgResponse;
import com.jieli.jl_rcsp.tool.DeviceStatusManager;
import com.jieli.jl_rcsp.util.JL_Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Adapts the existing Android GATT connection to the public Jieli SDK. All protocol
 * bytes, authentication and filesystem commands are produced by that SDK. This
 * class only subscribes to notifications and fragments/serializes the transport.
 * A new instance belongs to one connection; a closed instance is never reused.
 */
final class JieliSession {
    interface Listener {
        void onCapabilities(JSONObject capabilities);
        void onTransfer(JSONObject event);
        void onFatal(String code, String message);
    }

    static final UUID SERVICE = uuid("ae00");
    static final UUID WRITE = uuid("ae01");
    static final UUID NOTIFY = uuid("ae02");
    private static final UUID CCCD = uuid("2902");
    private static final long OPERATION_MS = 8_000L;
    private static final long AUTH_MS = 15_000L;
    private static final long INITIALIZATION_MS = 45_000L;
    private static final int MAX_QUEUED_BYTES = 1_048_576;

    private final Context context;
    private final BluetoothGatt gatt;
    private final BluetoothDevice device;
    private final BluetoothGattCharacteristic tx;
    private final BluetoothGattCharacteristic rx;
    private final BluetoothGattDescriptor cccd;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ArrayDeque<byte[]> writes = new ArrayDeque<>();
    private final AtomicInteger queuedBytes = new AtomicInteger();
    private volatile boolean closed;
    private volatile boolean faulted;
    private volatile boolean acceptingPackets;
    private boolean authenticated;
    private boolean rcspReady;
    private boolean filesystemReady;
    private boolean ready;
    private boolean configureRequested;
    private boolean descriptorPending;
    private boolean mtuPending;
    private int attMtu = 23;
    private int payloadSize = 20;
    private int sdkType = -1;
    private int screenWidth;
    private int screenHeight;
    private String protocolVersion;
    private String firmwareVersion;
    private byte[] pendingWrite;
    private Runnable operationTimeout;
    private Runnable writeTimeout;
    private Runnable initializationTimeout;
    private RcspAuth authentication;
    private WatchOpImpl watch;
    private JieliWatchfaceService watchface;

    /** A UUID alone is insufficient: directions, properties and CCCD must match. */
    static boolean matchesProfile(BluetoothGatt gatt) {
        if (gatt == null) return false;
        BluetoothGattService service = gatt.getService(SERVICE);
        if (service == null) return false;
        BluetoothGattCharacteristic tx = service.getCharacteristic(WRITE);
        BluetoothGattCharacteristic rx = service.getCharacteristic(NOTIFY);
        return tx != null && rx != null
                && (tx.getProperties() & (BluetoothGattCharacteristic.PROPERTY_WRITE
                | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)) != 0
                && (rx.getProperties() & (BluetoothGattCharacteristic.PROPERTY_NOTIFY
                | BluetoothGattCharacteristic.PROPERTY_INDICATE)) != 0
                && rx.getDescriptor(CCCD) != null;
    }

    JieliSession(Context context, BluetoothGatt gatt, Listener listener) {
        if (!matchesProfile(gatt)) throw new IllegalArgumentException("Perfil Jieli GATT incompleto.");
        this.context = context.getApplicationContext();
        this.gatt = gatt;
        this.device = gatt.getDevice();
        this.listener = listener;
        BluetoothGattService service = gatt.getService(SERVICE);
        tx = service.getCharacteristic(WRITE);
        rx = service.getCharacteristic(NOTIFY);
        cccd = rx.getDescriptor(CCCD);
    }

    @SuppressWarnings("deprecation")
    void start() {
        if (!active()) return;
        capabilities("preparing_transport", "Perfil Jieli encontrado. Preparando notificações e transporte BLE…");
        try {
            // Avoid the SDK's packet/debug logs, which may contain authentication data.
            JL_Log.configureLog(context, false, false);
            if (!gatt.setCharacteristicNotification(rx, true)) {
                fail("notifications_unavailable", "Não foi possível ativar as notificações do relógio.");
                return;
            }
            byte[] value = (rx.getProperties() & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0
                    ? BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    : BluetoothGattDescriptor.ENABLE_INDICATION_VALUE;
            descriptorPending = true;
            boolean started;
            if (Build.VERSION.SDK_INT >= 33) started = gatt.writeDescriptor(cccd, value) == 0;
            else {
                cccd.setValue(value);
                started = gatt.writeDescriptor(cccd);
            }
            if (!started) {
                descriptorPending = false;
                fail("notifications_failed", "O Android não iniciou a assinatura das notificações.");
                return;
            }
            armOperationTimeout("notifications_timeout", "O relógio não confirmou a assinatura de notificações.");
        } catch (RuntimeException | LinkageError e) {
            fail("transport_failed", "Não foi possível preparar o transporte Jieli neste aparelho.");
        }
    }

    void onDescriptorWrite(BluetoothGattDescriptor descriptor, int status) {
        if (!active() || !descriptorPending || descriptor == null
                || !CCCD.equals(descriptor.getUuid()) || !sameCharacteristic(rx, descriptor.getCharacteristic())) return;
        descriptorPending = false;
        clearOperationTimeout();
        if (status != BluetoothGatt.GATT_SUCCESS) {
            fail("notifications_failed", "A assinatura de notificações falhou (GATT " + status + ").");
            return;
        }
        try {
            mtuPending = true;
            if (gatt.requestMtu(247)) {
                armOperationTimeout("mtu_timeout", "A negociação BLE não respondeu. Reconecte o relógio.");
            } else {
                // A rejected request did not start an operation: the default ATT MTU is safe.
                mtuPending = false;
                beginAuthentication();
            }
        } catch (RuntimeException e) {
            fail("mtu_failed", "Não foi possível iniciar a negociação do transporte BLE.");
        }
    }

    void onMtuChanged(int mtu, int status) {
        if (!active() || !mtuPending) return;
        mtuPending = false;
        clearOperationTimeout();
        if (status == BluetoothGatt.GATT_SUCCESS && mtu >= 23) {
            attMtu = Math.min(mtu, 517);
            // The official BLE transport caps its payload at 509 bytes.
            payloadSize = Math.min(attMtu - 3, 509);
        }
        beginAuthentication();
    }

    private void beginAuthentication() {
        if (!active()) return;
        acceptingPackets = true;
        capabilities("authenticating", "Autenticando com o SDK oficial Jieli…");
        armInitializationTimeout(AUTH_MS, "authentication_timeout", "O relógio não concluiu a autenticação Jieli.");
        try {
            authentication = new RcspAuth(this::sendSdkData, new RcspAuth.OnRcspAuthListener() {
                @Override public void onInitResult(boolean initialized) {
                    // The SDK invokes this from its constructor: defer until assignment completes.
                    post(() -> {
                        if (!initialized) fail("authentication_unavailable", "A biblioteca de autenticação Jieli não iniciou.");
                    });
                }
                @Override public void onAuthSuccess(BluetoothDevice target) {
                    post(() -> {
                        if (!sameDevice(target) || authenticated) return;
                        authenticated = true;
                        beginRcsp();
                    });
                }
                @Override public void onAuthFailed(BluetoothDevice target, int code, String detail) {
                    post(() -> {
                        if (sameDevice(target)) fail("authentication_failed",
                                "O relógio recusou a autenticação Jieli (código " + code + ").");
                    });
                }
            });
            if (!authentication.startAuth(device)) {
                fail("authentication_failed", "Não foi possível iniciar a autenticação do relógio.");
            }
        } catch (RuntimeException | LinkageError e) {
            fail("authentication_unavailable", "A autenticação oficial não está disponível neste aparelho.");
        }
    }

    private void beginRcsp() {
        if (!active() || !authenticated || watch != null) return;
        capabilities("initializing", "Autenticado. Consultando capacidades e sistema de arquivos do relógio…");
        armInitializationTimeout(INITIALIZATION_MS, "watch_initialization_timeout",
                "O relógio não concluiu a inicialização do sistema de mostradores.");
        try {
            watch = new WatchOpImpl(WatchOpImpl.FUNC_WATCH) {
                @Override public BluetoothDevice getConnectedDevice() {
                    return active() && authenticated ? device : null;
                }
                @Override public boolean sendDataToDevice(BluetoothDevice target, byte[] data) {
                    return sendSdkData(target, data);
                }
            };
            watch.registerOnWatchCallback(watchCallback);
            watch.notifyBtDeviceConnection(device, StateCode.CONNECTION_OK);
        } catch (RuntimeException | LinkageError e) {
            fail("watch_sdk_unavailable", "O SDK de mostradores não conseguiu iniciar nesta conexão.");
        }
    }

    private final OnWatchCallback watchCallback = new OnWatchCallback() {
        @Override public void onRcspInit(BluetoothDevice target, boolean initialized) {
            post(() -> {
                if (!sameDevice(target)) return;
                if (!initialized || watch == null) {
                    fail("rcsp_initialization_failed", "O relógio não confirmou a inicialização do protocolo RCSP.");
                    return;
                }
                DeviceInfo info = watch.getDeviceInfo(device);
                if (info == null || info.isMandatoryUpgrade() || !info.isSupportExternalFlashTransfer()) {
                    fail("watch_capability_missing", "O relógio não anunciou um sistema de mostradores compatível e disponível.");
                    return;
                }
                rcspReady = true;
                sdkType = info.getSdkType();
                protocolVersion = info.getProtocolVersion();
                firmwareVersion = info.getVersionName();
                maybeReady();
            });
        }

        @Override public void onWatchSystemInit(int code) {
            post(() -> {
                if (code != 0 || watch == null || !watch.isWatchSystemOk()) {
                    fail("watch_filesystem_failed", "O sistema de arquivos do relógio não está disponível (código " + code + ").");
                    return;
                }
                filesystemReady = true;
                maybeReady();
            });
        }

        @Override public void onExternalFlashMsg(BluetoothDevice target, ExternalFlashMsgResponse response) {
            post(() -> {
                if (!sameDevice(target) || response == null) return;
                screenWidth = response.getScreenWidth();
                screenHeight = response.getScreenHeight();
                maybeReady();
            });
        }

        @Override public void onRcspError(BluetoothDevice target, BaseError error) {
            post(() -> {
                if (sameDevice(target)) fail("rcsp_error", "O SDK reportou uma falha RCSP (código "
                        + (error == null ? "desconhecido" : error.getCode()) + "). Reconecte para tentar novamente.");
            });
        }

        @Override public void onMandatoryUpgrade(BluetoothDevice target) {
            post(() -> {
                if (sameDevice(target)) fail("firmware_recovery_required", "O firmware do relógio está em modo de atualização. O envio de fundo foi bloqueado.");
            });
        }

        @Override public void onWatchSystemException(BluetoothDevice target, int code) {
            post(() -> {
                if (sameDevice(target)) fail("watch_filesystem_error", "O relógio informou um erro no sistema de arquivos (código " + code + ").");
            });
        }

        @Override public void onResourceUpdateUnfinished(BluetoothDevice target) {
            post(() -> {
                if (sameDevice(target)) fail("resources_incomplete", "O relógio informou uma atualização de recursos incompleta. O envio de fundo foi bloqueado.");
            });
        }
    };

    private void maybeReady() {
        if (!active() || ready || !authenticated || !rcspReady || !filesystemReady || watch == null) return;
        ExternalFlashMsgResponse flash = DeviceStatusManager.getInstance().getExtFlashMsg(device);
        if (flash != null) {
            screenWidth = flash.getScreenWidth();
            screenHeight = flash.getScreenHeight();
        }
        if (screenWidth < 64 || screenHeight < 64 || screenWidth > 1024 || screenHeight > 1024) {
            fail("screen_size_missing", "O relógio não informou dimensões de tela válidas para converter a imagem.");
            return;
        }
        if (sdkType != JLChipFlag.JL_CHIP_FLAG_695X_WATCH
                && sdkType != JLChipFlag.JL_CHIP_FLAG_701X_WATCH
                && sdkType != JLChipFlag.JL_CHIP_FLAG_707N_WATCH) {
            fail("image_encoder_unsupported", "O relógio usa uma variante Jieli sem conversor de imagem verificado neste aplicativo (sdkType " + sdkType + ").");
            return;
        }
        WatchConfigure configuration = watch.getWatchConfigure(device);
        DeviceInfo info = watch.getDeviceInfo(device);
        if (configuration == null && info != null && info.isSupportDevConfigure()) {
            if (configureRequested) return;
            configureRequested = true;
            watch.requestDeviceConfigure(new OnWatchOpCallback<WatchConfigure>() {
                @Override public void onSuccess(WatchConfigure value) {
                    post(() -> {
                        if (value == null) fail("watch_configuration_missing", "O relógio retornou uma configuração de mostradores vazia.");
                        else finishReady(value);
                    });
                }
                @Override public void onFailed(BaseError error) {
                    post(() -> fail("watch_configuration_failed", "Não foi possível confirmar a configuração de mostradores do relógio."));
                }
            });
            return;
        }
        if (configuration == null && (sdkType != JLChipFlag.JL_CHIP_FLAG_695X_WATCH
                || info == null || info.isSupportDevConfigure())) {
            fail("watch_configuration_missing", "Esta geração de relógio exige uma configuração de mostradores que não foi informada.");
            return;
        }
        finishReady(configuration);
    }

    private void finishReady(WatchConfigure configuration) {
        if (!active() || ready || !authenticated || !rcspReady || !filesystemReady
                || watch == null || !watch.isRcspInit() || !watch.isWatchSystemOk()) return;
        if (configuration != null && (configuration.getNecessaryFunc() == null
                || !configuration.getNecessaryFunc().isSupportDialOp())) {
            fail("dial_operations_unsupported", "A configuração do relógio não permite operações de mostradores.");
            return;
        }
        try {
            watchface = new JieliWatchfaceService(context, watch, device,
                    event -> post(() -> {
                        listener.onTransfer(event);
                        if (event.optBoolean("reconnectRequired")) {
                            fail("reconnect_required", event.optString("message",
                                    "Reconecte o relógio antes de iniciar outra transferência."));
                        }
                    }));
            ready = true;
            clearInitializationTimeout();
            capabilities("ready", "Conexão Jieli autenticada e sistema de mostradores disponível. O fundo será validado antes do envio.");
        } catch (RuntimeException | LinkageError e) {
            fail("image_converter_unavailable", "A biblioteca oficial de conversão de imagens não iniciou neste aparelho.");
        }
    }

    void installBackground(String pngDataUrl) {
        if (!active() || !ready || !authenticated || !rcspReady || !filesystemReady
                || watch == null || !watch.isRcspInit() || !watch.isWatchSystemOk() || watchface == null) {
            listener.onTransfer(json("state", "blocked", "reason", "session_not_ready", "progress", 0,
                    "message", "O envio exige conexão autenticada e sistema de mostradores confirmado."));
            return;
        }
        try { watchface.installBackground(pngDataUrl); }
        catch (RuntimeException | LinkageError e) {
            fail("watch_operation_failed", "Não foi possível iniciar a operação de mostrador nesta conexão.");
        }
    }

    void cancelTransfer() {
        if (active() && watchface != null) watchface.cancel();
    }

    void onNotification(BluetoothGattCharacteristic characteristic, byte[] data) {
        if (!active() || !sameCharacteristic(rx, characteristic) || data == null || data.length == 0) return;
        try {
            if (!authenticated && authentication != null) authentication.handleAuthData(device, data);
            else if (authenticated && watch != null) watch.notifyReceiveDeviceData(device, data);
        } catch (RuntimeException | LinkageError e) {
            fail("protocol_receive_failed", "O SDK não conseguiu processar uma resposta do relógio.");
        }
    }

    /** SDK threads only reserve and copy; actual GATT operations all run on main. */
    private boolean sendSdkData(BluetoothDevice target, byte[] data) {
        if (!active() || !acceptingPackets || !sameDevice(target) || data == null || data.length == 0) return false;
        if (data.length > MAX_QUEUED_BYTES) return false;
        int reserved = queuedBytes.addAndGet(data.length);
        if (reserved > MAX_QUEUED_BYTES) {
            queuedBytes.addAndGet(-data.length);
            post(() -> fail("transport_queue_full", "A fila BLE excedeu o limite. Reconecte o relógio antes de reenviar."));
            return false;
        }
        byte[] copy = data.clone();
        main.post(() -> {
            if (!active()) { queuedBytes.addAndGet(-copy.length); return; }
            for (int offset = 0; offset < copy.length; offset += payloadSize) {
                writes.addLast(Arrays.copyOfRange(copy, offset, Math.min(copy.length, offset + payloadSize)));
            }
            writeNext();
        });
        return true;
    }

    @SuppressWarnings("deprecation")
    private void writeNext() {
        if (!active() || !acceptingPackets || pendingWrite != null || writes.isEmpty()) return;
        if (descriptorPending || mtuPending) {
            fail("transport_order_error", "O transporte recebeu dados antes de concluir a preparação BLE.");
            return;
        }
        pendingWrite = writes.removeFirst();
        try {
            int type = (tx.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0
                    ? BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT : BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE;
            boolean started;
            if (Build.VERSION.SDK_INT >= 33) started = gatt.writeCharacteristic(tx, pendingWrite, type) == 0;
            else {
                tx.setWriteType(type);
                tx.setValue(pendingWrite);
                started = gatt.writeCharacteristic(tx);
            }
            if (!started) {
                fail("ble_write_failed", "O Android recusou uma escrita BLE. O envio foi interrompido.");
                return;
            }
            final byte[] inFlight = pendingWrite;
            writeTimeout = () -> {
                if (active() && pendingWrite == inFlight) fail("ble_write_timeout", "Uma escrita BLE não foi confirmada. O envio foi interrompido.");
            };
            main.postDelayed(writeTimeout, OPERATION_MS);
        } catch (RuntimeException e) {
            fail("ble_write_failed", "A conexão não permitiu continuar a escrita BLE.");
        }
    }

    void onCharacteristicWrite(BluetoothGattCharacteristic characteristic, int status) {
        if (!active() || pendingWrite == null || !sameCharacteristic(tx, characteristic)) return;
        if (writeTimeout != null) main.removeCallbacks(writeTimeout);
        writeTimeout = null;
        queuedBytes.addAndGet(-pendingWrite.length);
        pendingWrite = null;
        if (status != BluetoothGatt.GATT_SUCCESS) {
            fail("ble_write_failed", "Uma escrita BLE falhou (GATT " + status + ").");
            return;
        }
        writeNext();
    }

    void close() {
        if (closed) return;
        boolean transferring = watchface != null && watchface.isBusy();
        closed = true;
        acceptingPackets = false;
        ready = false;
        main.removeCallbacksAndMessages(null);
        writes.clear();
        pendingWrite = null;
        if (watchface != null) {
            try { watchface.release(); } catch (RuntimeException | LinkageError ignored) { }
            watchface = null;
        }
        if (authentication != null) {
            try { authentication.stopAuth(device, false); } catch (RuntimeException | LinkageError ignored) { }
            try { authentication.destroy(); } catch (RuntimeException | LinkageError ignored) { }
            authentication = null;
        }
        if (watch != null) {
            try { watch.unregisterOnWatchCallback(watchCallback); } catch (RuntimeException | LinkageError ignored) { }
            try { watch.notifyBtDeviceConnection(device, StateCode.CONNECTION_DISCONNECT); }
            catch (RuntimeException | LinkageError ignored) { }
            try { watch.release(); } catch (RuntimeException | LinkageError ignored) { }
            watch = null;
        }
        if (transferring) listener.onTransfer(json("state", "error", "reason", "connection_closed", "progress", 0,
                "message", "A conexão foi encerrada durante a operação. A instalação não foi confirmada."));
    }

    private boolean active() { return !closed && !faulted; }
    private boolean sameDevice(BluetoothDevice other) { return device != null && device.equals(other); }

    private static boolean sameCharacteristic(BluetoothGattCharacteristic first, BluetoothGattCharacteristic second) {
        return first != null && second != null && first.getUuid().equals(second.getUuid())
                && first.getInstanceId() == second.getInstanceId()
                && first.getService() != null && second.getService() != null
                && first.getService().getUuid().equals(second.getService().getUuid())
                && first.getService().getInstanceId() == second.getService().getInstanceId();
    }

    private void post(Runnable action) {
        main.post(() -> {
            if (!active()) return;
            try { action.run(); }
            catch (RuntimeException | LinkageError e) {
                fail("sdk_operation_failed", "O SDK não conseguiu concluir uma operação nesta conexão.");
            }
        });
    }

    private void armOperationTimeout(String code, String message) {
        clearOperationTimeout();
        operationTimeout = () -> fail(code, message);
        main.postDelayed(operationTimeout, OPERATION_MS);
    }

    private void clearOperationTimeout() {
        if (operationTimeout != null) main.removeCallbacks(operationTimeout);
        operationTimeout = null;
    }

    private void armInitializationTimeout(long timeout, String code, String message) {
        clearInitializationTimeout();
        initializationTimeout = () -> fail(code, message);
        main.postDelayed(initializationTimeout, timeout);
    }

    private void clearInitializationTimeout() {
        if (initializationTimeout != null) main.removeCallbacks(initializationTimeout);
        initializationTimeout = null;
    }

    private void capabilities(String status, String message) {
        listener.onCapabilities(json("status", status, "message", message,
                "ready", ready && active(), "transferEnabled", ready && active(),
                "watchfaceTransferEnabled", ready && active(), "mode", "custom_background",
                "nativeClockLayout", true,
                "adapter", "jieli_official_sdk", "gattProfileMatched", true,
                "authenticated", authenticated, "rcspInitialized", rcspReady,
                "watchSystemInitialized", filesystemReady,
                "screenWidth", screenWidth, "screenHeight", screenHeight,
                "sdkType", sdkType, "protocolVersion", protocolVersion, "firmwareVersion", firmwareVersion,
                "attMtu", attMtu, "blePayloadSize", payloadSize));
    }

    private void fail(String code, String message) {
        if (!active()) return;
        faulted = true;
        acceptingPackets = false;
        ready = false;
        clearOperationTimeout();
        clearInitializationTimeout();
        capabilities(code, message);
        listener.onFatal(code, message);
    }

    private static UUID uuid(String value) {
        return UUID.fromString("0000" + value + "-0000-1000-8000-00805f9b34fb");
    }

    private static JSONObject json(Object... pairs) {
        JSONObject result = new JSONObject();
        for (int i = 0; i < pairs.length; i += 2) {
            try { result.put((String) pairs[i], pairs[i + 1] == null ? JSONObject.NULL : pairs[i + 1]); }
            catch (JSONException ignored) { }
        }
        return result;
    }
}
