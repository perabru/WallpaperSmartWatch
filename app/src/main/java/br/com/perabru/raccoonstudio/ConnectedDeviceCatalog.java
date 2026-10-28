package br.com.perabru.raccoonstudio;

import android.Manifest;
import android.bluetooth.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import org.json.*;
import java.util.*;

/** Public Android APIs only. Listing a device NEVER opens GATT or writes to it. */
public final class ConnectedDeviceCatalog {
    private final Context context;
    private final BluetoothManager manager;
    private final BluetoothAdapter adapter;
    private final BleController.Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, Row> rows = new LinkedHashMap<>();
    private final Set<Integer> pending = new HashSet<>();
    private final List<String> warnings = new ArrayList<>();
    private int generation;
    private boolean closed, registered;
    private volatile String snapshot = "{\"devices\":[],\"state\":\"idle\"}";
    private final Runnable refreshLater = this::refresh;
    private final BroadcastReceiver changes = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            // Do not trust broadcast extras; query the Bluetooth service again.
            main.removeCallbacks(refreshLater);
            main.postDelayed(refreshLater, 400);
        }
    };

    public ConnectedDeviceCatalog(Context c, BleController.Listener l) {
        context = c.getApplicationContext(); listener = l;
        manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager == null ? null : manager.getAdapter();
        IntentFilter f = new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
        f.addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        f.addAction(BluetoothDevice.ACTION_ACL_CONNECTED);
        f.addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED);
        f.addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED);
        f.addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED);
        try {
            if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(changes, f, Context.RECEIVER_EXPORTED);
            else context.registerReceiver(changes, f);
            registered = true;
        } catch (RuntimeException ignored) { /* Refresh button and onResume remain available. */ }
    }

    public boolean hasPermission() {
        return Build.VERSION.SDK_INT < 31 || context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }
    public JSONObject getSnapshot() {
        try { return new JSONObject(snapshot); } catch (JSONException e) { return new JSONObject(); }
    }
    public void remember(String address) {
        if (address != null && BluetoothAdapter.checkBluetoothAddress(address))
            context.getSharedPreferences("watch-catalog", 0).edit().putString("selected", address).apply();
    }
    public void refresh() {
        if (Looper.myLooper() != Looper.getMainLooper()) { main.post(this::refresh); return; }
        if (closed) return;
        final int token = ++generation;
        rows.clear(); pending.clear(); warnings.clear();
        if (!hasPermission()) { publish("permission", "Autorize Dispositivos próximos para consultar os relógios conectados."); return; }
        if (adapter == null) { publish("unavailable", "Este celular não disponibiliza Bluetooth."); return; }
        try {
            if (!adapter.isEnabled()) { publish("disabled", "Ative o Bluetooth do celular."); return; }
        } catch (SecurityException e) { publish("permission", "A permissão de Bluetooth foi removida."); return; }
        try {
            for (BluetoothDevice d : adapter.getBondedDevices()) add(d, "paired");
        } catch (RuntimeException e) { warnings.add("Não foi possível consultar todos os pareados."); }
        for (int profile : new int[]{BluetoothProfile.GATT, BluetoothProfile.GATT_SERVER}) {
            try { for (BluetoothDevice d : manager.getConnectedDevices(profile)) add(d, "ble"); }
            catch (RuntimeException e) { warnings.add("Consulta BLE indisponível para o perfil " + profile + "."); }
        }
        for (final int profile : new int[]{BluetoothProfile.HEADSET, BluetoothProfile.A2DP}) {
            pending.add(profile);
            try {
                boolean requested = adapter.getProfileProxy(context, new BluetoothProfile.ServiceListener() {
                    @Override public void onServiceConnected(int p, BluetoothProfile proxy) {
                        try {
                            if (!closed && token == generation) {
                                for (BluetoothDevice d : proxy.getConnectedDevices()) add(d, p == BluetoothProfile.HEADSET ? "calls" : "audio");
                            }
                        } catch (RuntimeException e) {
                            if (!closed && token == generation) warnings.add("Consulta de chamadas/áudio indisponível.");
                        } finally {
                            try { adapter.closeProfileProxy(p, proxy); } catch (RuntimeException ignored) {}
                            if (!closed && token == generation) { pending.remove(p); publishCurrent(); }
                        }
                    }
                    @Override public void onServiceDisconnected(int p) {
                        if (!closed && token == generation) { pending.remove(p); publishCurrent(); }
                    }
                }, profile);
                if (!requested) pending.remove(profile);
            } catch (RuntimeException e) { pending.remove(profile); warnings.add("Perfil de áudio não disponível."); }
        }
        publishCurrent();
        main.postDelayed(() -> {
            if (!closed && token == generation && !pending.isEmpty()) {
                warnings.add("A consulta de áudio demorou; a lista pode estar incompleta.");
                pending.clear(); publishCurrent();
            }
        }, 3500);
    }
    private void add(BluetoothDevice d, String origin) {
        if (d == null) return;
        try {
            String id = d.getAddress();
            Row r = rows.get(id);
            if (r == null) { r = new Row(); r.id = id; rows.put(id, r); }
            String n = d.getName(); if (n != null && !n.trim().isEmpty()) r.name = n;
            r.type = d.getType();
            r.paired |= d.getBondState() == BluetoothDevice.BOND_BONDED || "paired".equals(origin);
            r.ble |= "ble".equals(origin); r.calls |= "calls".equals(origin); r.audio |= "audio".equals(origin);
            BluetoothClass cls = d.getBluetoothClass();
            r.wrist |= cls != null && cls.getDeviceClass() == BluetoothClass.Device.WEARABLE_WRIST_WATCH;
        } catch (SecurityException e) { /* Permission can be revoked during a callback. */ }
    }
    private void publishCurrent() {
        if (!hasPermission()) { rows.clear(); publish("permission", "A permissão de Bluetooth foi removida."); return; }
        publish(pending.isEmpty() ? "complete" : "loading", rows.isEmpty()
            ? "Nenhum dispositivo disponível na lista do Android. Tente Buscar nas proximidades."
            : "Dispositivos informados pelo Android. Selecione o relógio para verificar a compatibilidade.");
    }
    private void publish(String state, String message) {
        if (closed) return;
        String saved = context.getSharedPreferences("watch-catalog", 0).getString("selected", "");
        JSONArray list = new JSONArray(), notes = new JSONArray();
        for (Row r : rows.values()) {
            try {
                JSONObject j = new JSONObject();
                j.put("id", r.id); j.put("name", r.name); j.put("paired", r.paired);
                j.put("systemConnected", r.ble || r.calls || r.audio);
                j.put("bleConnected", r.ble); j.put("callsConnected", r.calls); j.put("audioConnected", r.audio);
                j.put("type", r.type); j.put("classicOnly", r.type == BluetoothDevice.DEVICE_TYPE_CLASSIC && !r.ble);
                j.put("wristClass", r.wrist); j.put("remembered", r.id.equals(saved));
                // A name/class is only a suggestion. It is never protocol confirmation.
                j.put("candidate", r.wrist || r.id.equals(saved) || r.name.toLowerCase(Locale.ROOT).matches(".*(watch|mactive|microwear|ultra|rel[oó]gio).*"));
                list.put(j);
            } catch (JSONException ignored) {}
        }
        for (String warning : warnings) notes.put(warning);
        JSONObject out = new JSONObject();
        try {
            out.put("devices", list); out.put("state", state); out.put("message", message);
            out.put("partial", !warnings.isEmpty() || !pending.isEmpty()); out.put("warnings", notes);
            out.put("queriedAt", System.currentTimeMillis());
        } catch (JSONException ignored) {}
        snapshot = out.toString(); listener.onEvent("knownDevices", out);
    }
    public void close() {
        closed = true; ++generation; main.removeCallbacksAndMessages(null);
        if (registered) { try { context.unregisterReceiver(changes); } catch (RuntimeException ignored) {} }
        registered = false; rows.clear();
    }
    private static final class Row {
        String id, name = "Dispositivo sem nome";
        int type;
        boolean paired, ble, calls, audio, wrist;
    }
}
