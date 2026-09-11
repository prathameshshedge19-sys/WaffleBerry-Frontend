package com.waffleberry.legarya;

import android.webkit.JavascriptInterface;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AppOriginInstrumentedTest {
    @Rule public ActivityScenarioRule<MainActivity> rule = new ActivityScenarioRule<>(MainActivity.class);

    private static final class ResultSink {
        final CountDownLatch completed = new CountDownLatch(1);
        final AtomicReference<String> result = new AtomicReference<>();

        @JavascriptInterface public void complete(String value) {
            result.set(value);
            completed.countDown();
        }
    }

    private String waitForBundledPage() throws Exception {
        AtomicReference<String> loaded = new AtomicReference<>();
        for (int attempt = 0; attempt < 100 && loaded.get() == null; attempt++) {
            rule.getScenario().onActivity(activity -> {
                String url = activity.getBridge().getWebView().getUrl();
                if (url != null && url.startsWith("https://localhost/")) loaded.set(url);
            });
            if (loaded.get() == null) Thread.sleep(100);
        }
        assertNotNull(loaded.get());
        return loaded.get();
    }

    @Test public void productionPreflightAndCredentialedFetchAcceptExactBundledOrigin() throws Exception {
        assertTrue(waitForBundledPage().startsWith("https://localhost/"));
        ResultSink sink = new ResultSink();
        rule.getScenario().onActivity(activity -> {
            activity.getBridge().getWebView().addJavascriptInterface(sink, "L20Test");
            activity.getBridge().getWebView().reload();
        });
        Thread.sleep(5000);
        rule.getScenario().onActivity(activity -> {
            activity.getBridge().getWebView().evaluateJavascript(
            "fetch('https://89-167-14-211.sslip.io/api/v1/auth/refresh'," +
            "{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'})" +
            ".then(r=>L20Test.complete('PASS:'+r.status)).catch(e=>L20Test.complete('FAIL:'+e.name))", null);
        });
        assertTrue("credentialed production fetch did not complete", sink.completed.await(30, TimeUnit.SECONDS));
        assertNotNull(sink.result.get());
        assertTrue(sink.result.get(), sink.result.get().startsWith("PASS:"));
        rule.getScenario().onActivity(activity -> activity.getBridge().getWebView().removeJavascriptInterface("L20Test"));
    }
}
