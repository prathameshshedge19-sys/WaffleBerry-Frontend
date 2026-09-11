package com.waffleberry.legarya;

import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AppOriginInstrumentedTest {
    @Rule public ActivityScenarioRule<MainActivity> rule = new ActivityScenarioRule<>(MainActivity.class);

    @Test public void bundledPageUsesExactHttpsLocalhostOrigin() throws Exception {
        AtomicReference<String> loaded = new AtomicReference<>();
        for (int attempt = 0; attempt < 50 && loaded.get() == null; attempt++) {
            rule.getScenario().onActivity(activity -> loaded.set(activity.getBridge().getWebView().getUrl()));
            if (loaded.get() == null) Thread.sleep(100);
        }
        assertNotNull(loaded.get());
        assertTrue(loaded.get(), loaded.get().startsWith("https://localhost/"));
    }
}
