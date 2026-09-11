package com.waffleberry.legarya;

import android.media.AudioManager;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.nio.charset.StandardCharsets;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Synthetic state checks in the installed WebView; no credentials/provider audio. */
@RunWith(AndroidJUnit4.class)
public class LiveVoiceC2AInstrumentedTest {
    private MainActivity activity;
    // ActivityScenario waits for global UI idleness; the permanent Rya animation
    // never supplies that on a software-rendered emulator. Use bounded main-thread
    // handoffs, without disabling or changing production rendering.
    private void onActivity(java.util.function.Consumer<MainActivity> action) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<Throwable> error = new AtomicReference<>();
        new Handler(Looper.getMainLooper()).post(() -> {
            try { action.accept(activity); } catch (Throwable failure) { error.set(failure); }
            finally { done.countDown(); }
        });
        assertTrue("main-thread handoff timed out", done.await(10, TimeUnit.SECONDS));
        if (error.get() != null) throw new AssertionError(error.get());
    }
    @Before public void launch() throws Exception {
        android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        context.startActivity(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        for (int i = 0; i < 100 && activity == null; i++) {
            onActivity(unused -> {
                for (android.app.Activity candidate : ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)) {
                    if (candidate instanceof MainActivity) activity = (MainActivity) candidate;
                }
            });
            if (activity == null) Thread.sleep(100);
        }
        assertNotNull("MainActivity did not resume", activity);
    }
    private String run(String script) throws Exception {
        onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(
            "window.__c2aResult=null;window.C2AResult={complete:v=>{window.__c2aResult=String(v)}};" + script, null));
        AtomicReference<String> result = new AtomicReference<>();
        for (int i = 0; i < 300 && result.get() == null; i++) {
            onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript("window.__c2aResult", value -> {
                if (value != null && !"null".equals(value)) result.set(value);
            }));
            if (result.get() == null) Thread.sleep(100);
        }
        assertNotNull("WebView script timed out", result.get());
        return new org.json.JSONArray("[" + result.get() + "]").getString(0);
    }
    @Test public void staleCallsAndFocusLossAreFenced() throws Exception {
        boolean loaded = false;
        for (int i = 0; i < 100 && !loaded; i++) {
            loaded = "ready".equals(run("C2AResult.complete(window.LegaryaPlatform ? 'ready' : 'pending')"));
            if (!loaded) Thread.sleep(100);
        }
        assertTrue("Bundled platform not ready", loaded);
        String source;
        try (java.io.InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("live-voice-c2a.js")) {
            source = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
        String software = run(source);
        assertTrue(software, software.startsWith("PASS:"));
        AtomicReference<AudioManager.OnAudioFocusChangeListener> previous = new AtomicReference<>();
        onActivity(activity -> {
            try {
                Object plugin = activity.getBridge().getPlugin("LegaryaNative").getInstance();
                Field field = LegaryaNativePlugin.class.getDeclaredField("focusListener"); field.setAccessible(true);
                AudioManager.OnAudioFocusChangeListener listener = (AudioManager.OnAudioFocusChangeListener) field.get(plugin);
                previous.set(listener); listener.onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT);
            } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
        });
        assertEquals("PASS", run("setTimeout(()=>C2AResult.complete(window.__c2aSensitiveStops===1?'PASS':'FAIL'),500)"));
        assertEquals("PASS", run("window.LegaryaPlatform.requestAudioFocus('l15').then(r=>C2AResult.complete(r.granted?'PASS':'FAIL'))"));
        onActivity(activity -> previous.get().onAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS));
        assertEquals("PASS", run("setTimeout(()=>C2AResult.complete(window.__c2aSensitiveStops===1?'PASS':'FAIL'),250)"));
        assertEquals("PASS", run("window.LegaryaPlatform.releaseAudioFocus().then(()=>C2AResult.complete('PASS'))"));
    }

    @Test public void networkLossCleansStartingCall() throws Exception {
        boolean offline = "true".equals(InstrumentationRegistry.getArguments().getString("offline"));
        String expected = offline ? "offline" : "online";
        assertEquals("PASS:" + expected, run("(async()=>{" +
            "const {RealtimeClient}=await import('https://localhost/js/realtime-client.mjs');let state='online';" +
            "const client=new RealtimeClient({websocketUrl:'wss://example.invalid/realtime'," +
            "api:async()=>{await fetch('https://89-167-14-211.sslip.io/health',{credentials:'omit',cache:'no-store'}).catch(()=>{state='offline'});throw new Error('synthetic end');}});" +
            "client.acquireMicrophone=async()=>{};try{await client.start({legacy_id:1,mode:'rya'})}catch{}" +
            "if(client.state!=='idle'||client.socket||client.requestController)throw new Error('leak');client.dispose();return 'PASS:'+state;" +
            "})().then(v=>C2AResult.complete(v)).catch(e=>C2AResult.complete('FAIL:'+e.name+':'+String(e.message).slice(0,180)))"));
    }
}
