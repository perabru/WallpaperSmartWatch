package br.com.perabru.raccoonstudio;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.webkit.WebChromeClient;
import android.webkit.JsResult;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Local editor and Bluetooth bridge. Device capabilities are checked by the native session. */
public final class MainActivity extends Activity {
    private static final int PERMISSIONS = 10, ENABLE_BT = 11, SAVE_FILE = 12, OPEN_PROJECT = 13, OPEN_IMAGE = 14;
    private static final String APP_URL="https://appassets.androidplatform.net/assets/studio.html";
    private static final String ASSET_ORIGIN="https://appassets.androidplatform.net";
    private WebView web;
    private BleController ble;
    private boolean pageReady, destroyed, pendingScan, transferBusy;
    private byte[] pendingFile;
    private String pendingFileName;
    private volatile boolean importingImage;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(7,12,18));
        getWindow().setNavigationBarColor(Color.rgb(7,12,18));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7,12,18));
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left,bars.top,bars.right,bars.bottom);
                return WindowInsets.CONSUMED;
            });
        } else root.setFitsSystemWindows(true);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        web.setBackgroundColor(Color.rgb(7,12,18));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;
            }
            @Override public boolean onJsConfirm(WebView view,String url,String message,JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Confirmar",(d,w)->result.confirm()).setNegativeButton("Cancelar",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;
            }
        });
        ble = new BleController(this, this::emit);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u=request.getUrl();String path=u.getPath();
                boolean local="https".equals(u.getScheme())&&"appassets.androidplatform.net".equals(u.getHost())&&u.getPort()==-1&&("/assets/index.html".equals(path)||"/assets/studio.html".equals(path));
                if(local)pageReady=false;
                return !local;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri=request.getUrl();
                if("https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())){
                    String path=uri.getPath();
                    if(path!=null&&path.startsWith("/assets/")){
                        String name=path.substring(8);
                        if(name.equals("index.html")||name.equals("styles.css")||name.equals("face.js")||name.equals("app.js")||name.equals("jill-portrait.png")||name.equals("studio.html")||name.equals("studio.css")||name.equals("studio.js")||name.equals("studio-core.js")){
                            String mime=name.endsWith(".html")?"text/html":name.endsWith(".css")?"text/css":name.endsWith(".js")?"application/javascript":"image/png";
                            try{return new WebResourceResponse(mime,"UTF-8",getAssets().open(name));}catch(java.io.IOException ignored){}
                        }
                    }
                }
                return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
            }
            @Override public void onPageFinished(WebView view,String url) {
                if (!APP_URL.equals(url)&&!(ASSET_ORIGIN+"/assets/index.html").equals(url)) return;
                pageReady=true;
                emit("nativeReady", nativeInfo());
                emit("report", ble.getReport());
            }
        });
        web.loadUrl(APP_URL);
    }

    private JSONObject nativeInfo() {
        return object("appVersion","2.1.0","androidVersion",Build.VERSION.RELEASE,
            "androidSdk",Build.VERSION.SDK_INT,"phoneManufacturer",Build.MANUFACTURER,
            "phoneModel",Build.MODEL,"nativeBluetooth",true,"customBackgroundSupported",true,
            "transport","jieli_rcsp","transferEnabled",false,"capabilityCheckRequired",true);
    }

    private void emit(String type, JSONObject data) {
        runOnUiThread(() -> {
            if (destroyed) return;
            if ("transfer".equals(type)) {
                String state=data.optString("state");
                transferBusy="preparing".equals(state)||"converting".equals(state)||"transferring".equals(state)||
                    "uploading".equals(state)||"activating".equals(state)||"verifying".equals(state)||"cancelling".equals(state);
                if(transferBusy)getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            if (!pageReady || web == null) return;
            web.evaluateJavascript("window.onNativeEvent&&window.onNativeEvent("+
                JSONObject.quote(type)+","+data.toString()+");",null);
        });
    }

    private void startScanWithPermissions() {
        if (destroyed) return;
        List<String> needed=new ArrayList<>();
        if (Build.VERSION.SDK_INT>=31) {
            for(String permission:new String[]{Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT})
                if(checkSelfPermission(permission)!=PackageManager.PERMISSION_GRANTED)needed.add(permission);
        } else if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
        pendingScan=true;
        if(!needed.isEmpty()){requestPermissions(needed.toArray(new String[0]),PERMISSIONS);return;}
        if(Build.VERSION.SDK_INT<=30){
            LocationManager location=(LocationManager)getSystemService(LOCATION_SERVICE);
            boolean enabled=location!=null&&(Build.VERSION.SDK_INT>=28?location.isLocationEnabled():
                location.isProviderEnabled(LocationManager.GPS_PROVIDER)||location.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
            if(!enabled){pendingScan=false;emit("error",object("code","location_disabled","message","No Android 11 ou anterior, ative a Localização do celular para a busca Bluetooth. O app não lê sua posição."));return;}
        }
        BluetoothManager manager=(BluetoothManager)getSystemService(BLUETOOTH_SERVICE);
        BluetoothAdapter adapter=manager==null?null:manager.getAdapter();
        if(adapter==null){pendingScan=false;emit("error",object("code","no_bluetooth","message","Este aparelho não tem Bluetooth disponível."));return;}
        try {
            if(!adapter.isEnabled()){startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE),ENABLE_BT);return;}
            pendingScan=false;ble.startScan();
        } catch(RuntimeException exception){pendingScan=false;emit("error",object("code","bluetooth_error","message","Não foi possível iniciar o Bluetooth. Verifique as permissões nas configurações do Android."));}
    }

    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){
        super.onRequestPermissionsResult(code,permissions,grants);
        if(code!=PERMISSIONS)return;
        boolean allowed=grants.length>0;for(int value:grants)allowed&=value==PackageManager.PERMISSION_GRANTED;
        if(allowed&&pendingScan)startScanWithPermissions();
        else{pendingScan=false;emit("error",object("code","permission_denied","message","A busca precisa da permissão de dispositivos próximos. No Android 11 ou anterior, autorize a localização e ative-a para buscar."));}
    }

    private final class Bridge {
        @JavascriptInterface public String getNativeInfo(){return nativeInfo().toString();}
        @JavascriptInterface public void startScan(){runOnUiThread(MainActivity.this::startScanWithPermissions);}
        @JavascriptInterface public void stopScan(){ble.stopScan();}
        @JavascriptInterface public void connect(String address){if(address!=null&&address.length()<32)ble.connect(address);}
        @JavascriptInterface public void disconnect(){ble.disconnect();}
        @JavascriptInterface public String getReport(){return ble.getReport().toString();}
        @JavascriptInterface public void installBackground(String pngDataUrl){
            if(pngDataUrl==null||pngDataUrl.length()>12_000_000||!pngDataUrl.startsWith("data:image/png;base64,")){
                emit("transfer",object("state","error","message","Selecione uma imagem PNG válida de até 8 MB."));return;
            }
            runOnUiThread(()->ble.installBackground(pngDataUrl));
        }
        @JavascriptInterface public void cancelTransfer(){runOnUiThread(()->ble.cancelTransfer());}
        @JavascriptInterface public void showLicenses(){runOnUiThread(()->{
            try(InputStream input=getAssets().open("third-party.txt");ByteArrayOutputStream output=new ByteArrayOutputStream()){
                byte[] buffer=new byte[8192];int count;
                while((count=input.read(buffer))!=-1&&output.size()<200_000)output.write(buffer,0,count);
                new AlertDialog.Builder(MainActivity.this).setTitle("Licenças e créditos")
                    .setMessage(new String(output.toByteArray(),StandardCharsets.UTF_8)).setPositiveButton("Fechar",null).show();
            }catch(java.io.IOException e){emit("error",object("code","licenses_unavailable","message","Consulte as licenças no repositório WallpaperSmartWatch."));}
        });}
        @JavascriptInterface public void exportFile(String name,String mime,String base64){
            if(base64==null||base64.length()>56_000_000){emit("error",object("code","file_too_large","message","Arquivo grande demais para exportar."));return;}
            if(!"image/png".equals(mime)&&!"image/jpeg".equals(mime)&&!"image/webp".equals(mime)&&!"image/gif".equals(mime)&&!"application/json".equals(mime)){emit("error",object("code","invalid_type","message","Tipo de arquivo não permitido."));return;}
            try{
                byte[] bytes=Base64.decode(base64,Base64.DEFAULT);
                if(bytes.length>40_000_000)throw new IllegalArgumentException();
                String safeName=(name==null?"raccoon-file":name).replaceAll("[^a-zA-Z0-9._-]","_");
                if(safeName.length()>100)safeName=safeName.substring(0,100);
                final String filename=safeName;
                runOnUiThread(()->{
                    if(pendingFile!=null){emit("error",object("code","export_busy","message","Conclua o salvamento anterior primeiro."));return;}
                    pendingFile=bytes;pendingFileName=filename;
                    Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType(mime);intent.putExtra(Intent.EXTRA_TITLE,filename);
                    try{startActivityForResult(intent,SAVE_FILE);}catch(RuntimeException e){pendingFile=null;emit("error",object("code","export_unavailable","message","Não foi possível abrir o seletor de arquivos."));}
                });
            }catch(IllegalArgumentException e){emit("error",object("code","invalid_file","message","Os dados do arquivo não puderam ser exportados."));}
        }
        @JavascriptInterface public void importImage(){runOnUiThread(()->{
            if(importingImage){emit("error",object("code","image_busy","message","Aguarde a imagem atual terminar de abrir."));return;}
            Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("image/*");
            try{startActivityForResult(intent,OPEN_IMAGE);}catch(RuntimeException e){emit("error",object("code","image_unavailable","message","Não foi possível abrir a galeria."));}
        });}
        @JavascriptInterface public void importProject(){runOnUiThread(()->{
            Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","text/plain","application/octet-stream"});
            try{startActivityForResult(intent,OPEN_PROJECT);}catch(RuntimeException e){emit("error",object("code","import_unavailable","message","Não foi possível abrir o seletor de arquivos."));}
        });}
    }

    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==ENABLE_BT){if(result==RESULT_OK&&pendingScan)startScanWithPermissions();else{pendingScan=false;emit("error",object("code","bluetooth_disabled","message","Ative o Bluetooth para procurar o relógio."));}return;}
        if(request==SAVE_FILE){
            byte[] bytes=pendingFile;String filename=pendingFileName;pendingFile=null;pendingFileName=null;
            if(result!=RESULT_OK||data==null||data.getData()==null){emit("fileExport",object("state","cancelled"));return;}
            if(bytes==null){emit("error",object("code","export_expired","message","A exportação foi interrompida. Toque em exportar novamente."));return;}
            final Uri uri=data.getData();new Thread(()->{
                try(OutputStream output=getContentResolver().openOutputStream(uri,"w")){
                    if(output==null)throw new java.io.IOException("Output unavailable");output.write(bytes);output.flush();emit("fileExport",object("state","saved","name",filename));
                }catch(Exception e){emit("error",object("code","export_failed","message","Não foi possível salvar. Escolha outra pasta e tente novamente."));}
            },"raccoon-file-export").start();return;
        }
        if(request==OPEN_IMAGE&&result==RESULT_OK&&data!=null&&data.getData()!=null){
            final Uri uri=data.getData();importingImage=true;
            new Thread(()->{
                try{
                    String name="Imagem";
                    try(Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE},null,null,null)){
                        if(cursor!=null&&cursor.moveToFirst()){
                            int ni=cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME),si=cursor.getColumnIndex(OpenableColumns.SIZE);
                            if(ni>=0&&!cursor.isNull(ni))name=cursor.getString(ni);
                            if(si>=0&&!cursor.isNull(si)&&cursor.getLong(si)>24L*1024*1024)throw new java.io.IOException("Arquivo acima de 24 MB");
                        }
                    }
                    byte[] raw;
                    try(InputStream input=getContentResolver().openInputStream(uri);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                        if(input==null)throw new java.io.IOException("Não foi possível abrir a imagem");
                        byte[] buffer=new byte[8192];int count;
                        while((count=input.read(buffer))!=-1){if(bytes.size()+count>24*1024*1024)throw new java.io.IOException("Arquivo acima de 24 MB");bytes.write(buffer,0,count);}raw=bytes.toByteArray();
                    }
                    if(raw.length>=6&&raw[0]=='G'&&raw[1]=='I'&&raw[2]=='F'){
                        emit("imageImport",object("mime","image/gif","name",name,"base64",Base64.encodeToString(raw,Base64.NO_WRAP)));return;
                    }
                    Bitmap bitmap;
                    if(Build.VERSION.SDK_INT>=28){
                        bitmap=ImageDecoder.decodeBitmap(ImageDecoder.createSource(java.nio.ByteBuffer.wrap(raw)),(decoder,info,src)->{
                            int w=info.getSize().getWidth(),h=info.getSize().getHeight();
                            float factor=Math.min(1f,2048f/Math.max(w,h));
                            decoder.setTargetSize(Math.max(1,Math.round(w*factor)),Math.max(1,Math.round(h*factor)));
                            decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                        });
                    }else{
                        BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(raw,0,raw.length,bounds);
                        if(bounds.outWidth<=0||bounds.outHeight<=0)throw new java.io.IOException("Formato não suportado por este Android");
                        BitmapFactory.Options decode=new BitmapFactory.Options();decode.inSampleSize=1;
                        while(Math.max(bounds.outWidth,bounds.outHeight)/decode.inSampleSize>2048)decode.inSampleSize*=2;
                        bitmap=BitmapFactory.decodeByteArray(raw,0,raw.length,decode);
                        if(bitmap==null)throw new java.io.IOException("Imagem inválida");
                        try{ExifInterface exif=new ExifInterface(new ByteArrayInputStream(raw));int orientation=exif.getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);Matrix m=new Matrix();
                            switch(orientation){case 2:m.setScale(-1,1);break;case 3:m.setRotate(180);break;case 4:m.setScale(1,-1);break;case 5:m.setRotate(90);m.postScale(-1,1);break;case 6:m.setRotate(90);break;case 7:m.setRotate(-90);m.postScale(-1,1);break;case 8:m.setRotate(-90);break;default:break;}
                            if(!m.isIdentity()){Bitmap rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.getWidth(),bitmap.getHeight(),m,true);if(rotated!=bitmap)bitmap.recycle();bitmap=rotated;}
                        }catch(java.io.IOException ignored){}
                    }
                    try(ByteArrayOutputStream output=new ByteArrayOutputStream()){
                        if(!bitmap.compress(Bitmap.CompressFormat.PNG,100,output))throw new java.io.IOException("Não foi possível preparar a imagem");
                        bitmap.recycle();emit("imageImport",object("mime","image/png","name",name,"base64",Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP)));
                    }
                }catch(OutOfMemoryError e){emit("error",object("code","image_memory","message","Imagem grande demais para a memória do celular. Escolha uma versão menor."));}
                catch(Exception e){emit("error",object("code","image_invalid","message","Não foi possível abrir. Use uma imagem válida de até 24 MB; HEIC depende da versão do Android."));}
                finally{importingImage=false;}
            },"raccoon-image-import").start();return;
        }
        if(request==OPEN_PROJECT&&result==RESULT_OK&&data!=null&&data.getData()!=null){
            final Uri uri=data.getData();new Thread(()->{
                try(InputStream input=getContentResolver().openInputStream(uri);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                    if(input==null)throw new java.io.IOException();byte[] buffer=new byte[8192];int count;
                    while((count=input.read(buffer))!=-1){if(bytes.size()+count>36_000_000)throw new java.io.IOException();bytes.write(buffer,0,count);}
                    JSONObject project=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8));emit("projectImport",project);
                }catch(Exception e){emit("error",object("code","invalid_project","message","Selecione um projeto JSON do Raccoon Studio com até 36 MB."));}
            },"raccoon-project-import").start();
        }
    }

    private static JSONObject object(Object... values){JSONObject result=new JSONObject();try{for(int i=0;i<values.length;i+=2)result.put((String)values[i],values[i+1]);}catch(JSONException ignored){}return result;}
    @Override protected void onPause(){super.onPause();if(ble!=null)ble.stopScan();if(web!=null)web.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){destroyed=true;pageReady=false;if(ble!=null)ble.close();if(web!=null){web.removeJavascriptInterface("Android");web.destroy();web=null;}pendingFile=null;super.onDestroy();}
    @Override public void onBackPressed(){
        if(web==null){super.onBackPressed();return;}
        if(transferBusy){
            web.evaluateJavascript("window.navigateTo&&window.navigateTo('device');",null);
            emit("status",object("state","busy","message","Envio em andamento. Aguarde a confirmação ou cancele antes de sair."));return;
        }
        web.evaluateJavascript("window.RaccoonStudio?window.RaccoonStudio.getPage():null",value->{
            if(destroyed)return;
            if("\"faces\"".equals(value)||"null".equals(value))finish();
            else if(web!=null)web.evaluateJavascript("window.navigateTo&&window.navigateTo('faces');",null);
        });
    }
}
