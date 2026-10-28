package br.com.perabru.raccoonstudio;

import android.bluetooth.BluetoothDevice;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;

import com.jieli.bmp_convert.BmpConvert;
import com.jieli.bmp_convert.ConvertResult;
import com.jieli.bmp_convert.OnConvertListener;
import com.jieli.jl_fatfs.interfaces.OnFatFileProgressListener;
import com.jieli.jl_fatfs.model.FatFile;
import com.jieli.jl_fatfs.utils.FatUtil;
import com.jieli.jl_rcsp.constant.JLChipFlag;
import com.jieli.jl_rcsp.impl.WatchOpImpl;
import com.jieli.jl_rcsp.interfaces.watch.OnWatchOpCallback;
import com.jieli.jl_rcsp.model.WatchConfigure;
import com.jieli.jl_rcsp.model.base.BaseError;
import com.jieli.jl_rcsp.model.device.DeviceInfo;
import com.jieli.jl_rcsp.model.device.settings.v0.DialExpandInfo;
import com.jieli.jl_rcsp.model.response.ExternalFlashMsgResponse;
import com.jieli.jl_rcsp.tool.DeviceStatusManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Installs an editor PNG as a custom BACKGROUND through the public JieLi SDK.
 * The device firmware keeps ownership of the running clock and its layout.
 * No protocol bytes, firmware packages, or third-party dial binaries are used.
 */
public final class JieliWatchfaceService {
    public interface Listener { void onEvent(JSONObject event); }

    private static final int MAX_DATA_URL_CHARS = 16 * 1024 * 1024;
    private static final int MAX_INPUT_DIMENSION = 2048;
    private static final int MAX_SCREEN_DIMENSION = 1024;
    private static final long MAX_CONVERTED_BYTES = 16L * 1024 * 1024;
    private static final long QUERY_TIMEOUT_MS = 20_000L;
    private static final long LOCAL_TIMEOUT_MS = 90_000L;
    private static final long TRANSFER_IDLE_TIMEOUT_MS = 60_000L;
    private static final long TRANSFER_TOTAL_TIMEOUT_MS = 15 * 60_000L;
    private static final Pattern WATCH_NAME = Pattern.compile("(?i)^watch([0-9]{1,3})$");
    private static final Pattern BACKGROUND_NAME = Pattern.compile("(?i)^bgp_w[0-9]{3}$");
    private static final byte[] PNG_SIGNATURE = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};
    // A disconnect can destroy a session while the native converter is still
    // finishing. Serialize conversion across session instances as well.
    private static final AtomicBoolean CONVERTER_BUSY = new AtomicBoolean();

    private final Context context;
    private final WatchOpImpl watch;
    private final BluetoothDevice device;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService imageWorker = Executors.newSingleThreadExecutor();
    private Listener listener;
    private volatile boolean busy;
    private volatile boolean released;
    private boolean reconnectRequired;
    private Operation active;
    private long sequence;

    private static final class Operation {
        long id;
        String phase = "preparing";
        String originalDialPath;
        String backgroundName;
        String expectedBackgroundPath;
        int width;
        int height;
        int sdkType;
        int conversionType;
        boolean supportsDeviceConfigure;
        DialExpandInfo displayShape;
        File directory;
        File png;
        File binary;
        BmpConvert converter;
        boolean cancelRequested;
        volatile boolean localWorkRunning;
        boolean transferRunning;
        boolean ownsConverter;
        boolean cleaned;
        double progress;
        long transferStarted;
        Runnable timeout;
        final AtomicBoolean conversionCallbackSeen = new AtomicBoolean();
    }

    public JieliWatchfaceService(Context context, WatchOpImpl watch,
                                BluetoothDevice device, Listener listener) {
        if (context == null || watch == null || device == null || listener == null) {
            throw new IllegalArgumentException("Context, sessão, dispositivo e listener são obrigatórios.");
        }
        this.context = context.getApplicationContext();
        this.watch = watch;
        this.device = device;
        this.listener = listener;
    }

    public boolean isBusy() { return busy; }

    /** Accepts only a PNG data URL exported without the preview's simulated clock. */
    public void installBackground(String pngDataUrl) {
        onMain(() -> start(pngDataUrl));
    }

    public void cancel() { onMain(this::cancelOnMain); }

    public void release() {
        onMain(() -> {
            if (released) return;
            released = true;
            Operation op = active;
            if (op != null) {
                op.cancelRequested = true;
                if (op.transferRunning) {
                    try { watch.cancelTransfer(); } catch (RuntimeException ignored) { }
                }
                disarm(op);
                active = null;
                busy = false;
                cleanup(op);
            }
            listener = null;
            imageWorker.shutdownNow();
        });
    }

    private void start(String dataUrl) {
        if (released) return;
        if (reconnectRequired) {
            emit(null, "error", "Reconecte o relógio antes de iniciar outro envio.",
                    "reconnect_required", null);
            return;
        }
        if (busy) {
            // A duplicate tap must not emit a terminal event for the operation
            // already in progress, or let the UI clear its busy/wake-lock state.
            return;
        }
        if (dataUrl == null || !dataUrl.startsWith("data:image/png;base64,")
                || dataUrl.length() > MAX_DATA_URL_CHARS) {
            emit(null, "error", "A imagem deve ser um PNG válido de até 12 MB.",
                    "invalid_image", null);
            return;
        }
        if (!connectedAndReady()) {
            emit(null, "error", "Conecte e aguarde a identificação de um relógio JieLi compatível.",
                    "device_not_ready", null);
            return;
        }
        DeviceInfo info = watch.getDeviceInfo(device);
        ExternalFlashMsgResponse flash = DeviceStatusManager.getInstance().getExtFlashMsg(device);
        if (info == null || flash == null || !validScreen(flash.getScreenWidth(), flash.getScreenHeight())) {
            emit(null, "error", "O relógio não informou uma resolução de tela válida.",
                    "invalid_screen", null);
            return;
        }
        if (selectConversion(info.getSdkType(), false) < 0) {
            emit(null, "error", "O formato de imagem deste chipset ainda não é suportado.",
                    "unsupported_chipset", null);
            return;
        }
        Operation op = new Operation();
        op.id = ++sequence;
        op.width = flash.getScreenWidth();
        op.height = flash.getScreenHeight();
        op.sdkType = info.getSdkType();
        op.supportsDeviceConfigure = info.isSupportDevConfigure();
        active = op;
        busy = true;
        emit(op, "preparing", "Verificando o mostrador ativo e o suporte a fundo personalizado.", null, null);
        arm(op, QUERY_TIMEOUT_MS);
        try {
            watch.getCurrentWatchInfo(new OnWatchOpCallback<FatFile>() {
                @Override public void onSuccess(FatFile result) {
                    onMain(() -> {
                        if (!proceed(op)) return;
                        String path = result == null ? null : result.getPath();
                        if (path == null || path.isEmpty() || result.isDir()) {
                            fail(op, "custom_dial_required", "Selecione um mostrador personalizável no relógio e tente novamente.", null);
                            return;
                        }
                        op.originalDialPath = path;
                        checkBackgroundSupport(op, dataUrl);
                    });
                }
                @Override public void onFailed(BaseError error) {
                    onMain(() -> fail(op, "current_dial_unavailable", "Não foi possível consultar o mostrador ativo.", error));
                }
            });
        } catch (RuntimeException error) {
            fail(op, "device_query_failed", "A consulta ao relógio falhou.", null);
        }
    }

    private void checkBackgroundSupport(Operation op, String dataUrl) {
        arm(op, QUERY_TIMEOUT_MS);
        watch.getCustomWatchBgInfo(op.originalDialPath, new OnWatchOpCallback<String>() {
            @Override public void onSuccess(String existingBackground) {
                onMain(() -> {
                    if (!proceed(op)) return;
                    op.backgroundName = backgroundName(op.originalDialPath, existingBackground);
                    if (op.backgroundName == null) {
                        fail(op, "unsupported_dial_name", "O mostrador ativo não usa um perfil de fundo reconhecido. Selecione um mostrador personalizável e tente novamente.", null);
                        return;
                    }
                    WatchConfigure configure = watch.getWatchConfigure(device);
                    if (configure != null || !op.supportsDeviceConfigure) {
                        prepareWithConfiguration(op, dataUrl, configure);
                    }
                    else {
                        arm(op, QUERY_TIMEOUT_MS);
                        watch.requestDeviceConfigure(new OnWatchOpCallback<WatchConfigure>() {
                            @Override public void onSuccess(WatchConfigure configuration) {
                                onMain(() -> prepareWithConfiguration(op, dataUrl, configuration));
                            }
                            @Override public void onFailed(BaseError error) {
                                onMain(() -> fail(op, "dial_configuration_unavailable", "O relógio não forneceu a configuração necessária para preparar o fundo.", error));
                            }
                        });
                    }
                });
            }
            @Override public void onFailed(BaseError error) {
                onMain(() -> fail(op, "custom_dial_required", "O relógio não confirmou o fundo personalizado para este mostrador. Selecione um mostrador personalizável no MActive Pro ou no relógio e reconecte.", error));
            }
        });
    }

    private void prepareWithConfiguration(Operation op, String dataUrl, WatchConfigure configure) {
        if (!proceed(op)) return;
        // Legacy AC695X has a documented fixed RGB format. Other generations
        // require their configuration to decide RGB versus ARGB safely.
        boolean legacy = configure == null && !op.supportsDeviceConfigure
                && op.sdkType == JLChipFlag.JL_CHIP_FLAG_695X_WATCH;
        if (!legacy && (configure == null || configure.getNecessaryFunc() == null
                || !configure.getNecessaryFunc().isSupportDialOp())) {
            fail(op, "dial_operation_unavailable", "O firmware não confirmou a instalação de fundos para mostradores.", null);
            return;
        }
        boolean expanded = configure != null && configure.getFunctionOption() != null
                && configure.getFunctionOption().isSupportDialExpandInfo();
        op.conversionType = selectConversion(op.sdkType, expanded);
        op.displayShape = expanded ? configure.getDialExpandInfo() : null;
        op.phase = "preparing";
        op.directory = new File(context.getCacheDir(), "watchface-" + SystemClock.elapsedRealtime() + "-" + op.id);
        op.png = new File(op.directory, "background.png");
        op.binary = new File(op.directory, op.backgroundName);
        op.expectedBackgroundPath = FatUtil.getFatFilePath(op.binary.getAbsolutePath());
        emit(op, "preparing", "Preparando o fundo em " + op.width + " × " + op.height + " pixels.", null, null);
        arm(op, LOCAL_TIMEOUT_MS);
        op.localWorkRunning = true;
        imageWorker.execute(() -> {
            String problem = null;
            try { preparePng(op, dataUrl); }
            catch (IOException | RuntimeException error) { problem = "Não foi possível preparar o PNG para a tela do relógio."; }
            catch (OutOfMemoryError error) { problem = "A imagem excede a memória disponível. Exporte em uma resolução menor."; }
            final String failure = problem;
            onMain(() -> {
                op.localWorkRunning = false;
                if (!current(op)) { cleanup(op); return; }
                if (!proceed(op)) return;
                if (failure != null) { fail(op, "image_preparation_failed", failure, null); return; }
                convert(op);
            });
        });
    }

    private void preparePng(Operation op, String dataUrl) throws IOException {
        byte[] bytes = Base64.decode(dataUrl.substring("data:image/png;base64,".length()), Base64.DEFAULT);
        if (bytes.length < PNG_SIGNATURE.length) throw new IOException("PNG inválido");
        for (int i = 0; i < PNG_SIGNATURE.length; i++) {
            if (bytes[i] != PNG_SIGNATURE[i]) throw new IOException("PNG inválido");
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (bounds.outWidth < 1 || bounds.outHeight < 1
                || bounds.outWidth > MAX_INPUT_DIMENSION || bounds.outHeight > MAX_INPUT_DIMENSION) {
            throw new IOException("Dimensões de entrada inválidas");
        }
        Bitmap source = null;
        Bitmap target = null;
        try {
            source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (source == null) throw new IOException("PNG não decodificado");
            target = Bitmap.createBitmap(op.width, op.height, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(target);
            DialExpandInfo shape = op.displayShape;
            int fill = shape == null ? Color.BLACK : shape.getColor();
            if ((fill >>> 24) == 0) fill = Color.BLACK;
            canvas.drawColor(fill);
            if (shape != null) {
                Path mask = new Path();
                if (shape.getShape() == DialExpandInfo.SHAPE_CIRCULAR) {
                    mask.addCircle(op.width / 2f, op.height / 2f,
                            Math.min(op.width, op.height) / 2f, Path.Direction.CW);
                    canvas.clipPath(mask);
                } else if (shape.getShape() == DialExpandInfo.SHAPE_ROUNDED_RECTANGLE) {
                    float radius = Math.max(0, Math.min(shape.getRadius(), Math.min(op.width, op.height) / 2f));
                    mask.addRoundRect(new RectF(0, 0, op.width, op.height), radius, radius, Path.Direction.CW);
                    canvas.clipPath(mask);
                }
            }
            float scale = Math.min(op.width / (float) source.getWidth(), op.height / (float) source.getHeight());
            float width = source.getWidth() * scale;
            float height = source.getHeight() * scale;
            RectF rectangle = new RectF((op.width - width) / 2f, (op.height - height) / 2f,
                    (op.width + width) / 2f, (op.height + height) / 2f);
            canvas.drawBitmap(source, null, rectangle, new Paint(Paint.FILTER_BITMAP_FLAG));
            if (!op.directory.mkdirs() && !op.directory.isDirectory()) throw new IOException("Diretório temporário indisponível");
            try (FileOutputStream output = new FileOutputStream(op.png)) {
                if (!target.compress(Bitmap.CompressFormat.PNG, 100, output)) throw new IOException("Não foi possível salvar o PNG");
            }
        } finally {
            if (source != null) source.recycle();
            if (target != null) target.recycle();
        }
    }

    private void convert(Operation op) {
        if (!proceed(op)) return;
        if (!CONVERTER_BUSY.compareAndSet(false, true)) {
            fail(op, "converter_busy", "O conversor ainda está concluindo a imagem anterior. Aguarde antes de tentar novamente.", null);
            return;
        }
        op.ownsConverter = true;
        op.phase = "converting";
        op.progress = 5;
        emit(op, "converting", "Convertendo a imagem com o formato informado pelo relógio.", null, null);
        arm(op, LOCAL_TIMEOUT_MS);
        try {
            op.converter = new BmpConvert();
            op.localWorkRunning = true;
            op.converter.bitmapConvert(op.conversionType, op.png.getAbsolutePath(),
                    op.binary.getAbsolutePath(), new OnConvertListener() {
                        @Override public void onStart(String path) { }
                        @Override public void onStop(boolean result, String output) { converted(op, result); }
                        @Override public void onStop(ConvertResult result, String output) {
                            converted(op, result != null && result.isConvertSuccess());
                        }
                    });
        } catch (RuntimeException | LinkageError error) {
            op.localWorkRunning = false;
            op.ownsConverter = false;
            CONVERTER_BUSY.set(false);
            fail(op, "converter_unavailable", "O conversor oficial de imagem não está disponível neste celular.", null);
        }
    }

    private void converted(Operation op, boolean success) {
        if (!op.conversionCallbackSeen.compareAndSet(false, true)) return;
        if (op.ownsConverter) {
            op.ownsConverter = false;
            CONVERTER_BUSY.set(false);
        }
        onMain(() -> {
            op.localWorkRunning = false;
            if (!current(op)) { cleanup(op); return; }
            if (!proceed(op)) return;
            if (!success || !op.binary.isFile() || op.binary.length() < 1
                    || op.binary.length() > MAX_CONVERTED_BYTES) {
                fail(op, "conversion_failed", "O conversor não gerou um arquivo de fundo válido.", null);
                return;
            }
            if (!connectedAndReady()) {
                fail(op, "connection_lost", "A conexão foi perdida antes do envio.", null);
                return;
            }
            op.phase = "transferring";
            op.transferRunning = true;
            op.transferStarted = SystemClock.elapsedRealtime();
            op.progress = 10;
            emit(op, "transferring", "Enviando o fundo para o relógio.", null, null);
            arm(op, TRANSFER_IDLE_TIMEOUT_MS);
            watch.createWatchFile(op.binary.getAbsolutePath(), true, new OnFatFileProgressListener() {
                @Override public void onStart(String path) { }
                @Override public void onProgress(float progress) {
                    onMain(() -> {
                        if (!current(op)) return;
                        if (op.cancelRequested) return;
                        if (SystemClock.elapsedRealtime() - op.transferStarted > TRANSFER_TOTAL_TIMEOUT_MS) {
                            fail(op, "transfer_timeout", "O envio excedeu o tempo limite. Reconecte o relógio antes de tentar novamente.", null);
                            return;
                        }
                        if (Float.isNaN(progress) || Float.isInfinite(progress)) return;
                        op.progress = Math.max(op.progress, 10 + Math.max(0, Math.min(100, progress)) * .85);
                        emit(op, "transferring", "Enviando o fundo para o relógio.", null, null);
                        arm(op, TRANSFER_IDLE_TIMEOUT_MS);
                    });
                }
                @Override public void onStop(int result) {
                    onMain(() -> {
                        op.transferRunning = false;
                        if (!current(op)) { cleanup(op); return; }
                        if (op.cancelRequested) { finish(op, "cancelled", cancellationMessage(op), null, null); return; }
                        if (result != 0) {
                            fail(op, "device_transfer_failed", "O relógio recusou ou interrompeu o arquivo de fundo. A aplicação não foi confirmada; confira o relógio.", new BaseError(result));
                            return;
                        }
                        checkActiveDialBeforeActivation(op);
                    });
                }
            });
        });
    }

    private void checkActiveDialBeforeActivation(Operation op) {
        if (!proceed(op)) return;
        op.phase = "checking_dial";
        arm(op, QUERY_TIMEOUT_MS);
        watch.getCurrentWatchInfo(new OnWatchOpCallback<FatFile>() {
            @Override public void onSuccess(FatFile result) {
                onMain(() -> {
                    if (!proceed(op)) return;
                    if (result == null || !samePath(result.getPath(), op.originalDialPath)) {
                        fail(op, "active_dial_changed", "O mostrador ativo mudou durante o envio. A aplicação do fundo não foi confirmada; confira o relógio antes de tentar novamente.", null);
                        return;
                    }
                    activate(op);
                });
            }
            @Override public void onFailed(BaseError error) {
                onMain(() -> fail(op, "activation_precheck_failed", "O arquivo foi enviado, mas não foi possível confirmar o mostrador ativo. A ativação não foi solicitada.", error));
            }
        });
    }

    private void activate(Operation op) {
        if (!proceed(op)) return;
        op.phase = "activating";
        op.progress = 96;
        emit(op, "activating", "Aplicando o fundo ao mostrador ativo.", null, null);
        arm(op, QUERY_TIMEOUT_MS);
        watch.enableCustomWatchBg(op.expectedBackgroundPath, new OnWatchOpCallback<FatFile>() {
            @Override public void onSuccess(FatFile result) {
                onMain(() -> verifyActivation(op));
            }
            @Override public void onFailed(BaseError error) {
                onMain(() -> fail(op, "activation_failed", "O arquivo foi enviado, mas o relógio não confirmou sua aplicação. Selecione um mostrador que aceite fundo personalizado.", error));
            }
        });
    }

    private void verifyActivation(Operation op) {
        if (!current(op)) return;
        op.phase = "verifying";
        op.progress = 99;
        emit(op, "verifying", "Confirmando o fundo aplicado no relógio.", null, null);
        arm(op, QUERY_TIMEOUT_MS);
        watch.getCurrentWatchInfo(new OnWatchOpCallback<FatFile>() {
            @Override public void onSuccess(FatFile result) {
                onMain(() -> {
                    if (!current(op)) return;
                    if (result == null || !samePath(result.getPath(), op.originalDialPath)) {
                        fail(op, "activation_unconfirmed", "O mostrador ativo mudou e a aplicação do fundo não pôde ser confirmada.", null);
                        return;
                    }
                    watch.getCustomWatchBgInfo(op.originalDialPath, new OnWatchOpCallback<String>() {
                        @Override public void onSuccess(String path) {
                            onMain(() -> {
                                if (!current(op)) return;
                                if (!samePath(path, op.expectedBackgroundPath)) {
                                    fail(op, "background_binding_mismatch", "O relógio respondeu, mas não confirmou o novo arquivo como fundo do mostrador.", null);
                                    return;
                                }
                                op.progress = 100;
                                finish(op, "complete", "Fundo aplicado ao mostrador atual. Hora e data mantêm o estilo e a posição definidos pelo relógio.", null, null);
                            });
                        }
                        @Override public void onFailed(BaseError error) {
                            onMain(() -> fail(op, "activation_unconfirmed", "A ativação foi solicitada, mas sua confirmação não chegou. Confira o relógio antes de repetir.", error));
                        }
                    });
                });
            }
            @Override public void onFailed(BaseError error) {
                onMain(() -> fail(op, "activation_unconfirmed", "A ativação foi solicitada, mas sua confirmação não chegou. Confira o relógio antes de repetir.", error));
            }
        });
    }

    private void cancelOnMain() {
        Operation op = active;
        if (op == null || !busy || released) return;
        if ("activating".equals(op.phase) || "verifying".equals(op.phase)) {
            emit(op, op.phase, "A ativação já foi enviada. Aguardando a confirmação do relógio.", null, null);
            return;
        }
        if (op.cancelRequested) return;
        op.cancelRequested = true;
        if (op.localWorkRunning) {
            // BmpConvert has no documented cancellation callback. Keep this
            // operation busy until its worker/converter callback actually ends.
            op.phase = "cancelling";
            emit(op, "cancelling", "Aguardando o preparo da imagem terminar para concluir o cancelamento.", null, null);
            arm(op, LOCAL_TIMEOUT_MS);
            return;
        }
        if ("transferring".equals(op.phase)) {
            op.phase = "cancelling";
            emit(op, "cancelling", "Solicitando cancelamento ao relógio.", null, null);
            arm(op, QUERY_TIMEOUT_MS);
            try { watch.cancelTransfer(); }
            catch (RuntimeException error) {
                fail(op, "cancellation_unconfirmed", "O cancelamento não foi confirmado. Desconecte o relógio antes de tentar novamente.", null);
            }
        } else {
            finish(op, "cancelled", cancellationMessage(op), null, null);
        }
    }

    private boolean connectedAndReady() {
        try { return watch.isDeviceConnected(device) && watch.isRcspInit() && watch.isWatchSystemOk(); }
        catch (RuntimeException error) { return false; }
    }

    private boolean current(Operation op) { return !released && busy && active == op; }

    private boolean proceed(Operation op) {
        if (!current(op)) return false;
        if (op.cancelRequested) {
            finish(op, "cancelled", cancellationMessage(op), null, null);
            return false;
        }
        return true;
    }

    private void arm(Operation op, long milliseconds) {
        disarm(op);
        op.timeout = () -> {
            if (!current(op)) return;
            boolean activation = "activating".equals(op.phase) || "verifying".equals(op.phase);
            fail(op, "operation_timeout", op.localWorkRunning
                    ? "O preparo da imagem excedeu o tempo limite. Aguarde a conclusão do conversor antes de tentar novamente."
                    : activation
                    ? "A ativação foi solicitada, mas não houve confirmação. Confira o relógio e reconecte antes de repetir."
                    : "O relógio não respondeu dentro do prazo. Reconecte antes de tentar novamente.", null);
        };
        main.postDelayed(op.timeout, milliseconds);
    }

    private void disarm(Operation op) {
        if (op.timeout != null) main.removeCallbacks(op.timeout);
        op.timeout = null;
    }

    private void fail(Operation op, String reason, String message, BaseError error) {
        if (!current(op)) return;
        boolean abortTransfer = op.transferRunning;
        if (abortTransfer || "activating".equals(op.phase) || "verifying".equals(op.phase)) {
            reconnectRequired = true;
        }
        // Invalidate the operation before calling cancelTransfer: an SDK callback
        // may be synchronous and must never advance a failed operation.
        finish(op, "error", message, reason, error);
        if (abortTransfer) {
            try { watch.cancelTransfer(); } catch (RuntimeException ignored) { }
        }
    }

    private void finish(Operation op, String state, String message, String reason, BaseError error) {
        if (!current(op)) return;
        disarm(op);
        active = null;
        busy = false;
        emit(op, state, message, reason, error);
        cleanup(op);
    }

    private void cleanup(Operation op) {
        if (op.cleaned || op.localWorkRunning || op.transferRunning) return;
        op.cleaned = true;
        if (op.converter != null) {
            try { op.converter.release(); } catch (RuntimeException | LinkageError ignored) { }
        }
        if (op.directory != null) {
            File[] files = op.directory.listFiles();
            if (files != null) for (File file : files) if (file.isFile()) file.delete();
            op.directory.delete();
        }
    }

    private void emit(Operation op, String state, String message, String reason, BaseError error) {
        if (released || listener == null) return;
        JSONObject event = new JSONObject();
        try {
            event.put("state", state);
            event.put("message", message);
            event.put("protocol", "jieli_rcsp");
            event.put("mode", "custom_background");
            event.put("nativeClockLayout", true);
            event.put("reconnectRequired", reconnectRequired);
            event.put("progress", op == null ? 0 : op.progress);
            event.put("cancelable", busy && op != null && !op.cancelRequested && !"activating".equals(op.phase) && !"verifying".equals(op.phase));
            if (reason != null) event.put("reason", reason);
            if (error != null) {
                event.put("deviceErrorCode", error.getCode());
                event.put("deviceSubCode", error.getSubCode());
            }
            if (op != null) {
                event.put("operationId", op.id);
                event.put("screenWidth", op.width);
                event.put("screenHeight", op.height);
                event.put("sdkType", op.sdkType);
                event.put("imageFormat", op.conversionType);
                event.put("dialPath", op.originalDialPath);
            }
        } catch (JSONException ignored) { }
        try { listener.onEvent(event); } catch (RuntimeException ignored) { }
    }

    private void onMain(Runnable action) {
        Runnable guarded = () -> {
            try { action.run(); }
            catch (RuntimeException | LinkageError error) {
                Operation op = active;
                if (op != null) fail(op, "sdk_operation_failed",
                        "A operação do relógio falhou. Reconecte antes de tentar novamente.", null);
                else if (!released) emit(null, "error", "A operação do relógio não está disponível neste celular.",
                        "sdk_operation_failed", null);
            }
        };
        if (Looper.myLooper() == Looper.getMainLooper()) guarded.run();
        else main.post(guarded);
    }

    private static String cancellationMessage(Operation op) {
        return op.transferStarted > 0
                ? "Envio cancelado. A aplicação do fundo não foi confirmada; confira o relógio."
                : "Operação cancelada antes do envio ao relógio.";
    }

    static boolean validScreen(int width, int height) {
        return width >= 64 && height >= 64 && width <= MAX_SCREEN_DIMENSION && height <= MAX_SCREEN_DIMENSION;
    }

    static int selectConversion(int sdkType, boolean alpha) {
        if (sdkType == JLChipFlag.JL_CHIP_FLAG_695X_WATCH) return BmpConvert.TYPE_695N_RBG;
        if (sdkType == JLChipFlag.JL_CHIP_FLAG_701X_WATCH) return alpha ? BmpConvert.TYPE_701N_ARGB : BmpConvert.TYPE_701N_RGB;
        if (sdkType == JLChipFlag.JL_CHIP_FLAG_707N_WATCH) return alpha ? BmpConvert.TYPE_707N_ARGB : BmpConvert.TYPE_707N_RGB;
        return -1;
    }

    static String backgroundName(String watchPath, String existingBackground) {
        if (existingBackground != null && !existingBackground.equalsIgnoreCase("null")
                && !existingBackground.equalsIgnoreCase("/null") && !existingBackground.isEmpty()) {
            String name = existingBackground.substring(existingBackground.lastIndexOf('/') + 1);
            return BACKGROUND_NAME.matcher(name).matches() ? name.toLowerCase(Locale.ROOT) : null;
        }
        if (watchPath == null) return null;
        String name = watchPath.substring(watchPath.lastIndexOf('/') + 1);
        Matcher match = WATCH_NAME.matcher(name);
        if (!match.matches()) return null;
        return String.format(Locale.ROOT, "bgp_w%03d", Integer.parseInt(match.group(1)));
    }

    static boolean samePath(String first, String second) {
        if (first == null || second == null) return false;
        String a = first.startsWith("/") ? first : "/" + first;
        String b = second.startsWith("/") ? second : "/" + second;
        return a.equalsIgnoreCase(b);
    }
}
