package br.com.perabru.raccoonstudio;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.SparseArray;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.UUID;

/** BLE discovery/diagnostics and an authenticated adapter for the public Jieli SDK. */
public final class BleController {
    public interface Listener {
        void onEvent(String type, JSONObject data);
    }

    private static final long SCAN_MS = 12_000L;
    private static final long CONNECT_MS = 18_000L;
    private static final long DISCOVERY_MS = 15_000L;
    private static final long READ_MS = 7_000L;
    private static final UUID DEVICE_INFO = uuid("180a");
    private static final UUID BATTERY_SERVICE = uuid("180f");
    private static final UUID BATTERY_LEVEL = uuid("2a19");
    private static final Map<UUID, String> INFO_FIELDS = new LinkedHashMap<>();

    static {
        INFO_FIELDS.put(uuid("2a29"), "manufacturer");
        INFO_FIELDS.put(uuid("2a24"), "model");
        INFO_FIELDS.put(uuid("2a26"), "firmware");
        INFO_FIELDS.put(uuid("2a27"), "hardware");
        INFO_FIELDS.put(uuid("2a28"), "software");
    }

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final BluetoothAdapter adapter;
    private final Map<String, ScanEntry> devices = new LinkedHashMap<>();
    private final Map<String, String> information = new LinkedHashMap<>();
    private final ArrayDeque<ReadRequest> readQueue = new ArrayDeque<>();
    private Listener listener;
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private BluetoothGatt gatt;
    private JieliSession jieliSession;
    private ReadRequest pendingRead;
    private Runnable scanTimeout;
    private Runnable connectionTimeout;
    private Runnable discoveryTimeout;
    private Runnable readTimeout;
    private Runnable devicesUpdate;
    private long scanGeneration;
    private long connectionGeneration;
    private boolean scanning;
    private boolean connected;
    private boolean diagnosticsComplete;
    private volatile boolean closed;
    private String state = "idle";
    private String selectedAddress;
    private String selectedName;
    private JSONObject selectedAdvertisement;
    private JSONArray services = new JSONArray();
    private JSONArray reads = new JSONArray();
    private JSONObject lastError;
    private Integer batteryPercent;
    private Integer lastGattStatus;
    private boolean protocolAttempted;
    private JSONObject capabilities = initialCapabilities();
    // String imutável: a ponte JavaScript pode consultar o relatório fora da thread principal.
    private volatile String reportJson;

    public BleController(Activity activity, Listener listener) {
        if (activity == null || listener == null) {
            throw new IllegalArgumentException("Activity e Listener são obrigatórios.");
        }
        context = activity.getApplicationContext();
        this.listener = listener;
        BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager == null ? null : manager.getAdapter();
        updateReport();
    }

    public void startScan() { onMain(this::startScanMain); }
    public void stopScan() { onMain(() -> stopScanMain(true)); }
    public void connect(String address) { onMain(() -> connectMain(address)); }
    public void disconnect() { onMain(() -> disconnectMain("user")); }
    public void installBackground(String pngDataUrl) {
        onMain(() -> {
            if (!connected || gatt == null || jieliSession == null) {
                emit("transfer", json("state", "blocked", "reason", "session_not_ready", "progress", 0,
                        "message", "Conecte um relógio com protocolo confirmado antes de enviar o fundo."));
                return;
            }
            jieliSession.installBackground(pngDataUrl);
        });
    }
    public void cancelTransfer() { onMain(() -> { if (jieliSession != null) jieliSession.cancelTransfer(); }); }

    public JSONObject getReport() {
        try {
            return new JSONObject(reportJson);
        } catch (JSONException | NullPointerException e) {
            return json("protocol", protocol(), "state", "unavailable");
        }
    }

    public void requestInstall(String faceId) {
        onMain(() -> emit("transfer", json(
                "state", "blocked", "reason", "image_payload_required", "progress", 0,
                "faceId", faceId,
                "message", "Prepare a imagem do fundo no editor e use Enviar ao relógio.")));
    }

    public void close() {
        onMain(() -> {
            closed = true;
            stopScanMain(false);
            releaseGatt();
            main.removeCallbacksAndMessages(null);
            state = "closed";
            updateReport();
            listener = null;
        });
    }

    private void onMain(Runnable action) {
        if (closed) return;
        Runnable guarded = () -> { if (!closed) action.run(); };
        if (Looper.myLooper() == Looper.getMainLooper()) guarded.run();
        else main.post(guarded);
    }

    private boolean has(String permission) {
        return context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean canConnect() {
        return Build.VERSION.SDK_INT < 31 || has(Manifest.permission.BLUETOOTH_CONNECT);
    }

    private boolean canScan() {
        return Build.VERSION.SDK_INT >= 31
                ? has(Manifest.permission.BLUETOOTH_SCAN)
                : has(Manifest.permission.ACCESS_FINE_LOCATION);
    }

    private boolean requireBluetooth(boolean scan) {
        if (adapter == null) {
            error("bluetooth_unavailable", "Este aparelho não oferece Bluetooth.");
            return false;
        }
        if (!canConnect() || (scan && !canScan())) {
            error("permission_required", "Autorize as permissões de Bluetooth"
                    + (Build.VERSION.SDK_INT < 31 && scan ? " e localização" : "") + " para continuar.");
            return false;
        }
        try {
            if (!adapter.isEnabled()) {
                error("bluetooth_disabled", "Ative o Bluetooth do celular para continuar.");
                return false;
            }
        } catch (SecurityException e) {
            error("permission_required", "A permissão de Bluetooth foi removida.");
            return false;
        }
        return true;
    }

    private void startScanMain() {
        if (scanning) {
            status("scanning", "A busca por dispositivos já está em andamento.");
            return;
        }
        if (gatt != null) {
            error("connection_busy", "Desconecte o relógio antes de iniciar uma nova busca.");
            return;
        }
        if (!requireBluetooth(true)) return;
        try {
            scanner = adapter.getBluetoothLeScanner();
            if (scanner == null) {
                error("scanner_unavailable", "O scanner BLE não está disponível. Confira o Bluetooth.");
                return;
            }
            devices.clear();
            final long generation = ++scanGeneration;
            scanCallback = new ScanCallback() {
                @Override public void onScanResult(int callbackType, ScanResult result) {
                    main.post(() -> {
                        if (!closed && scanning && generation == scanGeneration) addDevice(result);
                    });
                }
                @Override public void onBatchScanResults(List<ScanResult> results) {
                    main.post(() -> {
                        if (closed || !scanning || generation != scanGeneration) return;
                        for (ScanResult result : results) addDevice(result);
                    });
                }
                @Override public void onScanFailed(int errorCode) {
                    main.post(() -> {
                        if (closed || !scanning || generation != scanGeneration) return;
                        stopScanMain(false);
                        error("scan_failed", "A busca BLE falhou (código " + errorCode + ").");
                    });
                }
            };
            scanning = true;
            scanner.startScan(null, new ScanSettings.Builder()
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), scanCallback);
            scanTimeout = () -> { if (generation == scanGeneration) stopScanMain(true); };
            main.postDelayed(scanTimeout, SCAN_MS);
            status("scanning", "Buscando dispositivos BLE por até 12 segundos…");
            emitDevices();
        } catch (SecurityException e) {
            stopScanMain(false);
            error("permission_required", "A permissão para buscar dispositivos foi removida.");
        } catch (RuntimeException e) {
            stopScanMain(false);
            error("scan_failed", "Não foi possível iniciar a busca BLE.");
        }
    }

    private void addDevice(ScanResult result) {
        if (result == null || result.getDevice() == null) return;
        try {
            BluetoothDevice device = result.getDevice();
            String address = device.getAddress();
            ScanRecord record = result.getScanRecord();
            String name = record == null ? null : record.getDeviceName();
            if ((name == null || name.trim().isEmpty()) && canConnect()) name = device.getName();
            ScanEntry previous = devices.get(address);
            if (name == null || name.trim().isEmpty()) name = previous == null ? null : previous.name;
            ScanEntry entry = new ScanEntry(address,
                    name == null || name.trim().isEmpty() ? "Dispositivo sem nome" : name,
                    result.getRssi(), result.isConnectable(), record);
            devices.put(address, entry);
            if (devicesUpdate == null) {
                devicesUpdate = () -> { devicesUpdate = null; if (!closed) emitDevices(); };
                main.postDelayed(devicesUpdate, 200L);
            }
        } catch (SecurityException e) {
            stopScanMain(false);
            error("permission_required", "A permissão para ler os dispositivos foi removida.");
        }
    }

    private void stopScanMain(boolean announce) {
        boolean wasScanning = scanning;
        scanning = false;
        ++scanGeneration;
        cancel(scanTimeout); scanTimeout = null;
        cancel(devicesUpdate); devicesUpdate = null;
        if (scanner != null && scanCallback != null) {
            try { scanner.stopScan(scanCallback); }
            catch (RuntimeException ignored) { /* A permissão pode ter sido removida durante a busca. */ }
        }
        scanner = null;
        scanCallback = null;
        if (wasScanning) {
            emitDevices();
            if (announce) status("scan_complete", "Busca concluída. Selecione o seu relógio.");
        }
    }

    private void emitDevices() {
        List<ScanEntry> ordered = new ArrayList<>(devices.values());
        Collections.sort(ordered, Comparator.comparingInt((ScanEntry e) -> e.rssi).reversed());
        JSONArray rows = new JSONArray();
        for (ScanEntry entry : ordered) rows.put(json(
                "id", entry.address, "name", entry.name, "rssi", entry.rssi,
                "connectable", entry.connectable));
        emit("devices", json("devices", rows, "scanning", scanning));
    }

    private void connectMain(String address) {
        if (gatt != null) {
            error("connection_busy", "Já existe uma conexão ou tentativa em andamento. Desconecte antes de tentar outra.");
            return;
        }
        if (address == null || !BluetoothAdapter.checkBluetoothAddress(address.toUpperCase(Locale.US))) {
            error("invalid_address", "Selecione um dispositivo com endereço Bluetooth válido.");
            return;
        }
        if (!requireBluetooth(false)) return;
        stopScanMain(false);
        selectedAddress = address.toUpperCase(Locale.US);
        ScanEntry scanned = devices.get(selectedAddress);
        selectedName = scanned == null ? "Relógio BLE" : scanned.name;
        selectedAdvertisement = scanned == null ? null : scanned.advertisement();
        services = new JSONArray();
        reads = new JSONArray();
        information.clear();
        readQueue.clear();
        pendingRead = null;
        batteryPercent = null;
        lastError = null;
        lastGattStatus = null;
        diagnosticsComplete = false;
        protocolAttempted = false;
        capabilities = initialCapabilities();
        emit("capabilities", capabilities);
        connected = false;
        state = "connecting";
        final long generation = ++connectionGeneration;
        status("connecting", "Conectando a " + selectedName + "…");
        publishReport();
        try {
            BluetoothDevice device = adapter.getRemoteDevice(selectedAddress);
            gatt = device.connectGatt(context, false, callback(generation), BluetoothDevice.TRANSPORT_LE);
            if (gatt == null) {
                failConnection("connection_failed", "O Android não conseguiu iniciar a conexão GATT.", null);
                return;
            }
            connectionTimeout = () -> {
                if (!closed && generation == connectionGeneration && !connected) {
                    failConnection("connection_timeout", "O relógio não respondeu à tentativa de conexão.", null);
                }
            };
            main.postDelayed(connectionTimeout, CONNECT_MS);
        } catch (SecurityException e) {
            failConnection("permission_required", "A permissão de conexão Bluetooth foi removida.", null);
        } catch (RuntimeException e) {
            failConnection("connection_failed", "Não foi possível abrir a conexão BLE com este dispositivo.", null);
        }
    }

    private BluetoothGattCallback callback(final long generation) {
        return new BluetoothGattCallback() {
            @Override public void onConnectionStateChange(BluetoothGatt source, int status, int newState) {
                main.post(() -> {
                    if (!current(source, generation)) return;
                    lastGattStatus = status;
                    if (status != BluetoothGatt.GATT_SUCCESS) {
                        failConnection("gatt_error", "A conexão BLE terminou com o código GATT " + status + ".", status);
                    } else if (newState == BluetoothProfile.STATE_CONNECTED) {
                        if (connected) return;
                        cancel(connectionTimeout); connectionTimeout = null;
                        connected = true;
                        state = "discovering";
                        emit("connected", connectionEvent("connected", null));
                        status("discovering", "Conectado. Identificando os serviços BLE disponíveis…");
                        publishReport();
                        try {
                            if (!canConnect() || !source.discoverServices()) {
                                failConnection("discovery_failed", "Não foi possível iniciar a descoberta dos serviços.", null);
                                return;
                            }
                            discoveryTimeout = () -> {
                                if (current(source, generation) && "discovering".equals(state)) {
                                    failConnection("discovery_timeout", "O relógio não concluiu a descoberta de serviços.", null);
                                }
                            };
                            main.postDelayed(discoveryTimeout, DISCOVERY_MS);
                        } catch (RuntimeException e) {
                            failConnection("discovery_failed", "O Android não conseguiu consultar os serviços do relógio.", null);
                        }
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        releaseGatt();
                        state = "disconnected";
                        emit("connected", connectionEvent("disconnected", "remote"));
                        status("disconnected", "O relógio foi desconectado.");
                        publishReport();
                    }
                });
            }

            @Override public void onServicesDiscovered(BluetoothGatt source, int status) {
                main.post(() -> {
                    if (!current(source, generation) || !"discovering".equals(state)) return;
                    cancel(discoveryTimeout); discoveryTimeout = null;
                    lastGattStatus = status;
                    if (status != BluetoothGatt.GATT_SUCCESS) {
                        failConnection("discovery_failed", "A consulta de serviços falhou (GATT " + status + ").", status);
                        return;
                    }
                    inspectServices(source);
                });
            }

            @SuppressWarnings("deprecation")
            @Override public void onCharacteristicRead(BluetoothGatt source,
                                                       BluetoothGattCharacteristic characteristic, int status) {
                byte[] value = characteristic.getValue();
                byte[] copy = value == null ? new byte[0] : value.clone();
                main.post(() -> { if (current(source, generation)) receiveRead(characteristic, copy, status); });
            }

            @Override public void onCharacteristicRead(BluetoothGatt source,
                                                       BluetoothGattCharacteristic characteristic,
                                                       byte[] value, int status) {
                byte[] copy = value == null ? new byte[0] : value.clone();
                main.post(() -> { if (current(source, generation)) receiveRead(characteristic, copy, status); });
            }

            @Override public void onDescriptorWrite(BluetoothGatt source,
                                                     BluetoothGattDescriptor descriptor, int status) {
                main.post(() -> {
                    if (current(source, generation) && jieliSession != null) jieliSession.onDescriptorWrite(descriptor, status);
                });
            }

            @Override public void onMtuChanged(BluetoothGatt source, int mtu, int status) {
                main.post(() -> {
                    if (current(source, generation) && jieliSession != null) jieliSession.onMtuChanged(mtu, status);
                });
            }

            @Override public void onCharacteristicWrite(BluetoothGatt source,
                                                         BluetoothGattCharacteristic characteristic, int status) {
                main.post(() -> {
                    if (current(source, generation) && jieliSession != null) jieliSession.onCharacteristicWrite(characteristic, status);
                });
            }

            @SuppressWarnings("deprecation")
            @Override public void onCharacteristicChanged(BluetoothGatt source,
                                                           BluetoothGattCharacteristic characteristic) {
                byte[] value = characteristic.getValue();
                byte[] copy = value == null ? new byte[0] : value.clone();
                main.post(() -> {
                    if (current(source, generation) && jieliSession != null) jieliSession.onNotification(characteristic, copy);
                });
            }

            @Override public void onCharacteristicChanged(BluetoothGatt source,
                                                           BluetoothGattCharacteristic characteristic, byte[] value) {
                byte[] copy = value == null ? new byte[0] : value.clone();
                main.post(() -> {
                    if (current(source, generation) && jieliSession != null) jieliSession.onNotification(characteristic, copy);
                });
            }
        };
    }

    private boolean current(BluetoothGatt source, long generation) {
        return !closed && source == gatt && generation == connectionGeneration;
    }

    private void inspectServices(BluetoothGatt source) {
        try {
            List<BluetoothGattService> found = source.getServices();
            JSONArray inventory = new JSONArray();
            Map<String, Boolean> queued = new LinkedHashMap<>();
            for (BluetoothGattService service : found) {
                JSONArray characteristics = new JSONArray();
                for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                    JSONArray descriptors = new JSONArray();
                    for (BluetoothGattDescriptor descriptor : characteristic.getDescriptors()) {
                        descriptors.put(json("uuid", descriptor.getUuid().toString()));
                    }
                    characteristics.put(json(
                            "uuid", characteristic.getUuid().toString(),
                            "instanceId", characteristic.getInstanceId(),
                            "propertiesMask", characteristic.getProperties(),
                            "properties", properties(characteristic.getProperties()),
                            "descriptors", descriptors));
                    String field = null;
                    if (DEVICE_INFO.equals(service.getUuid())) field = INFO_FIELDS.get(characteristic.getUuid());
                    else if (BATTERY_SERVICE.equals(service.getUuid()) && BATTERY_LEVEL.equals(characteristic.getUuid())) field = "battery";
                    if (field != null && !queued.containsKey(field)) {
                        if ((characteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_READ) != 0) {
                            readQueue.add(new ReadRequest(characteristic, field));
                            queued.put(field, true);
                        } else {
                            reads.put(json("field", field, "serviceUuid", service.getUuid().toString(),
                                    "characteristicUuid", characteristic.getUuid().toString(),
                                    "state", "not_readable"));
                        }
                    }
                }
                inventory.put(json("uuid", service.getUuid().toString(),
                        "instanceId", service.getInstanceId(),
                        "type", service.getType() == BluetoothGattService.SERVICE_TYPE_PRIMARY ? "primary" : "secondary",
                        "characteristics", characteristics));
            }
            services = inventory;
            state = "reading";
            status("reading", "Lendo apenas identificação e bateria dos serviços Bluetooth padrão…");
            publishReport();
            readNext();
        } catch (RuntimeException e) {
            failConnection("service_inspection_failed", "Não foi possível inspecionar os serviços BLE recebidos.", null);
        }
    }

    private void readNext() {
        if (closed || gatt == null || !connected || !"reading".equals(state) || pendingRead != null) return;
        if (readQueue.isEmpty()) {
            diagnosticsComplete = true;
            startProtocolIfSupported();
            return;
        }
        if (!canConnect()) {
            failConnection("permission_required", "A permissão de conexão Bluetooth foi removida.", null);
            return;
        }
        final ReadRequest request = readQueue.removeFirst();
        pendingRead = request;
        try {
            if (!gatt.readCharacteristic(request.characteristic)) {
                reads.put(request.result("not_started", null, null));
                pendingRead = null;
                main.post(this::readNext);
                return;
            }
            readTimeout = () -> {
                if (closed || pendingRead != request) return;
                reads.put(request.result("timeout", null, null));
                pendingRead = null;
                readTimeout = null;
                // Não encadeia outra leitura enquanto uma operação GATT sem resposta pode estar pendente.
                while (!readQueue.isEmpty()) reads.put(readQueue.removeFirst().result("skipped_after_timeout", null, null));
                state = "ready";
                diagnosticsComplete = false;
                disableCapabilities("standard_read_timeout", "Uma leitura BLE não respondeu. Reconecte para verificar o protocolo de envio.");
                status("partial", "Os serviços foram identificados, mas uma leitura não respondeu. O relatório parcial está disponível.");
                publishReport();
            };
            main.postDelayed(readTimeout, READ_MS);
        } catch (SecurityException e) {
            failConnection("permission_required", "A permissão para consultar o relógio foi removida.", null);
        } catch (RuntimeException e) {
            reads.put(request.result("failed_to_start", null, null));
            pendingRead = null;
            main.post(this::readNext);
        }
    }

    private void receiveRead(BluetoothGattCharacteristic characteristic, byte[] value, int status) {
        if (pendingRead == null || !pendingRead.matches(characteristic)) return;
        ReadRequest request = pendingRead;
        pendingRead = null;
        cancel(readTimeout); readTimeout = null;
        JSONObject result = request.result(status == BluetoothGatt.GATT_SUCCESS ? "success" : "failed", status, value);
        if (status == BluetoothGatt.GATT_SUCCESS) {
            if ("battery".equals(request.field)) {
                int battery = value.length == 0 ? -1 : value[0] & 0xff;
                if (battery >= 0 && battery <= 100) {
                    batteryPercent = battery;
                    put(result, "value", battery);
                } else put(result, "state", "invalid_value");
            } else {
                String text = new String(value, StandardCharsets.UTF_8).replace("\u0000", "").trim();
                if (text.length() > 256) text = text.substring(0, 256);
                information.put(request.field, text);
                put(result, "value", text);
            }
        }
        reads.put(result);
        updateReport();
        main.post(this::readNext);
    }

    private void startProtocolIfSupported() {
        if (closed || !connected || gatt == null || jieliSession != null) return;
        if (!JieliSession.matchesProfile(gatt)) {
            state = "ready";
            disableCapabilities("unsupported_profile", "Diagnóstico concluído. Este perfil BLE não corresponde ao adaptador Jieli disponível.");
            status("ready", "Diagnóstico concluído. O relatório identifica os serviços deste relógio; o envio permanece indisponível para este perfil.");
            publishReport();
            return;
        }
        final BluetoothGatt source = gatt;
        final long generation = connectionGeneration;
        state = "protocol_initializing";
        protocolAttempted = true;
        try {
            jieliSession = new JieliSession(context, source, new JieliSession.Listener() {
                @Override public void onCapabilities(JSONObject data) {
                    if (!current(source, generation)) return;
                    capabilities = data;
                    if (data.optBoolean("ready") && data.optBoolean("transferEnabled")) state = "ready";
                    emit("capabilities", data);
                    status(data.optString("status"), data.optString("message"));
                    publishReport();
                }
                @Override public void onTransfer(JSONObject event) {
                    if (current(source, generation)) emit("transfer", event);
                }
                @Override public void onFatal(String code, String message) {
                    if (current(source, generation)) failConnection(code, message, null);
                }
            });
            jieliSession.start();
        } catch (RuntimeException | LinkageError e) {
            failConnection("jieli_sdk_unavailable", "O adaptador Jieli não conseguiu iniciar neste aparelho.", null);
        }
    }

    private void disconnectMain(String reason) {
        boolean hadConnection = gatt != null;
        releaseGatt();
        if (hadConnection) {
            state = "disconnected";
            emit("connected", connectionEvent("disconnected", reason));
            status("disconnected", "Relógio desconectado. O último relatório continua disponível.");
            publishReport();
        }
    }

    private void failConnection(String code, String message, Integer gattStatus) {
        boolean wasConnected = connected;
        if (gattStatus != null) lastGattStatus = gattStatus;
        releaseGatt();
        state = "error";
        disableCapabilities(code, message);
        lastError = json("code", code, "message", message, "gattStatus", gattStatus);
        if (wasConnected) emit("connected", connectionEvent("disconnected", code));
        publishReport();
        emit("error", lastError);
    }

    private void releaseGatt() {
        if (jieliSession != null) {
            jieliSession.close();
            jieliSession = null;
        }
        ++connectionGeneration;
        cancel(connectionTimeout); connectionTimeout = null;
        cancel(discoveryTimeout); discoveryTimeout = null;
        cancel(readTimeout); readTimeout = null;
        if (pendingRead != null) reads.put(pendingRead.result("interrupted", null, null));
        pendingRead = null;
        readQueue.clear();
        connected = false;
        disableCapabilities("disconnected", "Conexão encerrada. Reconecte o relógio para habilitar o envio.");
        BluetoothGatt old = gatt;
        gatt = null;
        if (old != null) {
            try { old.disconnect(); } catch (RuntimeException ignored) { }
            try { old.close(); } catch (RuntimeException ignored) { }
        }
    }

    private JSONObject connectionEvent(String eventState, String reason) {
        return json("id", selectedAddress, "name", selectedName, "state", eventState, "reason", reason);
    }

    private void status(String eventState, String message) {
        emit("status", json("state", eventState, "message", message));
    }

    private void error(String code, String message) {
        lastError = json("code", code, "message", message);
        updateReport();
        emit("error", lastError);
    }

    private void publishReport() { updateReport(); emit("report", getReport()); }

    private void updateReport() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        JSONObject info = new JSONObject();
        for (Map.Entry<String, String> entry : information.entrySet()) put(info, entry.getKey(), entry.getValue());
        JSONObject report = json(
                "schemaVersion", 2, "generatedAt", format.format(new Date()),
                "readOnly", !protocolAttempted, "protocol", protocol(),
                "connection", json("state", state, "connected", connected, "gattStatus", lastGattStatus),
                "device", json("address", selectedAddress, "name", selectedName, "advertisement", selectedAdvertisement),
                "deviceInformation", info,
                "battery", batteryPercent == null ? null : json("percent", batteryPercent, "source", "watch_ble_battery_service"),
                "services", services, "reads", reads, "diagnosticsComplete", diagnosticsComplete,
                "lastError", lastError,
                "limitations", new JSONArray().put("A identificação e bateria padrão podem não ser expostas pelo relógio.")
                        .put("UUIDs isolados não comprovam compatibilidade. O envio depende de autenticação, capacidades e sistema de arquivos confirmados ao vivo.")
                        .put("O adaptador Jieli usa exclusivamente comandos do SDK oficial. Outros perfis permanecem disponíveis apenas para diagnóstico.")
                        .put("O modo disponível altera o fundo de um mostrador compatível; elementos dinâmicos são os do firmware do relógio."));
        reportJson = report.toString();
    }

    private JSONObject protocol() {
        try { return new JSONObject(capabilities.toString()); }
        catch (JSONException e) { return initialCapabilities(); }
    }

    private static JSONObject initialCapabilities() {
        return json("status", "unverified", "ready", false, "transferEnabled", false,
                "watchfaceTransferEnabled", false, "reason", "not_connected", "mode", "custom_background",
                "message", "Conecte o relógio para verificar o protocolo e as capacidades disponíveis.");
    }

    private void disableCapabilities(String reason, String message) {
        JSONObject disabled = protocol();
        put(disabled, "status", reason);
        put(disabled, "reason", reason);
        put(disabled, "message", message);
        put(disabled, "ready", false);
        put(disabled, "transferEnabled", false);
        put(disabled, "watchfaceTransferEnabled", false);
        put(disabled, "authenticated", false);
        put(disabled, "rcspInitialized", false);
        put(disabled, "watchSystemInitialized", false);
        capabilities = disabled;
        emit("capabilities", capabilities);
    }

    private void emit(String type, JSONObject data) {
        if (closed || listener == null) return;
        // Todos os chamadores de emit executam na thread principal.
        listener.onEvent(type, data);
    }

    private void cancel(Runnable runnable) { if (runnable != null) main.removeCallbacks(runnable); }

    private static UUID uuid(String shortId) {
        return UUID.fromString("0000" + shortId + "-0000-1000-8000-00805f9b34fb");
    }

    private static JSONArray properties(int value) {
        JSONArray result = new JSONArray();
        if ((value & BluetoothGattCharacteristic.PROPERTY_READ) != 0) result.put("read");
        if ((value & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0) result.put("write");
        if ((value & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) result.put("write_without_response");
        if ((value & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) result.put("notify");
        if ((value & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0) result.put("indicate");
        if ((value & BluetoothGattCharacteristic.PROPERTY_BROADCAST) != 0) result.put("broadcast");
        if ((value & BluetoothGattCharacteristic.PROPERTY_SIGNED_WRITE) != 0) result.put("signed_write");
        if ((value & BluetoothGattCharacteristic.PROPERTY_EXTENDED_PROPS) != 0) result.put("extended");
        return result;
    }

    private static JSONObject json(Object... pairs) {
        JSONObject result = new JSONObject();
        for (int i = 0; i < pairs.length; i += 2) put(result, (String) pairs[i], pairs[i + 1]);
        return result;
    }

    private static void put(JSONObject object, String key, Object value) {
        try { object.put(key, value == null ? JSONObject.NULL : value); }
        catch (JSONException ignored) { /* As chaves e os tipos são definidos internamente. */ }
    }

    private static String hex(byte[] bytes) {
        if (bytes == null) return "";
        StringBuilder text = new StringBuilder(Math.min(bytes.length, 512) * 2);
        final char[] digits = "0123456789abcdef".toCharArray();
        for (int i = 0; i < bytes.length && i < 512; i++) {
            int value = bytes[i] & 0xff;
            text.append(digits[value >>> 4]).append(digits[value & 0xf]);
        }
        return text.toString();
    }

    private static final class ReadRequest {
        final BluetoothGattCharacteristic characteristic;
        final String field;
        ReadRequest(BluetoothGattCharacteristic characteristic, String field) {
            this.characteristic = characteristic;
            this.field = field;
        }
        boolean matches(BluetoothGattCharacteristic other) {
            return other != null && characteristic.getUuid().equals(other.getUuid())
                    && characteristic.getInstanceId() == other.getInstanceId()
                    && characteristic.getService() != null && other.getService() != null
                    && characteristic.getService().getUuid().equals(other.getService().getUuid())
                    && characteristic.getService().getInstanceId() == other.getService().getInstanceId();
        }
        JSONObject result(String state, Integer status, byte[] value) {
            JSONObject result = json("field", field,
                    "serviceUuid", characteristic.getService().getUuid().toString(),
                    "characteristicUuid", characteristic.getUuid().toString(),
                    "state", state, "gattStatus", status);
            if (value != null) {
                put(result, "rawHex", hex(value));
                put(result, "byteLength", value.length);
                if (value.length > 512) put(result, "rawTruncated", true);
            }
            return result;
        }
    }

    private static final class ScanEntry {
        final String address;
        final String name;
        final int rssi;
        final boolean connectable;
        final ScanRecord record;
        final long seenAt = System.currentTimeMillis();
        ScanEntry(String address, String name, int rssi, boolean connectable, ScanRecord record) {
            this.address = address; this.name = name; this.rssi = rssi;
            this.connectable = connectable; this.record = record;
        }
        JSONObject advertisement() {
            JSONArray uuids = new JSONArray();
            JSONArray manufacturerData = new JSONArray();
            JSONObject serviceData = new JSONObject();
            if (record != null) {
                if (record.getServiceUuids() != null) {
                    for (ParcelUuid uuid : record.getServiceUuids()) uuids.put(uuid.toString());
                }
                SparseArray<byte[]> data = record.getManufacturerSpecificData();
                if (data != null) {
                    for (int i = 0; i < data.size(); i++) manufacturerData.put(
                            json("companyId", data.keyAt(i), "rawHex", hex(data.valueAt(i))));
                }
                if (record.getServiceData() != null) {
                    for (Map.Entry<ParcelUuid, byte[]> entry : record.getServiceData().entrySet()) {
                        put(serviceData, entry.getKey().toString(), hex(entry.getValue()));
                    }
                }
            }
            byte[] raw = record == null ? null : record.getBytes();
            return json("name", name, "rssi", rssi, "connectable", connectable,
                    "seenAtEpochMs", seenAt, "rawHex", hex(raw),
                    "byteLength", raw == null ? 0 : raw.length,
                    "serviceUuids", uuids, "manufacturerData", manufacturerData, "serviceData", serviceData);
        }
    }
}
