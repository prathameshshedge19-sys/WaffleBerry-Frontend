# Product guidance and preservation celebration

Every HTML page includes `product-guide.js` and `product-guide.css`. Help sits in
the chat header or the lower-right corner of other pages and explains that page.
The Help dialog also offers a walkthrough replay in both chat experiences.
The gateway's top-bar Tutorial button provides a replayable three-step tour of
Build with Rya, Collaborate (COL code), and Talk with a Legacy (LEG code).

The builder walkthrough starts after an authenticated legacy context is ready.
The legacy-conversation walkthrough starts after that conversation is ready.
They explain Rya's builder role, memory uploads, the separate display picture,
and the gateway's Legacy-code conversation flow. Spotlighted controls remain
interactive. Opening a tool pauses guidance; closing it resumes the same step.
Mobile sidebar steps open the drawer. Skip, resume and completion are stored
per account and page in this browser; they are not synchronized across devices.

A confirmed preservation completion triggers a centred celebration at days 1,
7 and 30. Historical progress loaded on entry does not trigger a celebration.
Duplicate events are suppressed per account, legacy and milestone in this
browser. Help or another modal postpones the celebration. It dismisses after
4.5 seconds, or immediately via Keep going/Escape; pointer hover or user focus
allows more reading time. Reduced-motion preferences disable animations.

The existing consecutive-day counter drives the sidebar's 30-day progress.
Reward copy: “Complete a 30-day streak to earn 1 month of Legarya Plus.”
This release provides the reward messaging only. It does not create billing
entitlements, redeem rewards or assert that a subscription has been activated.
Subscription fulfillment needs a separate backend implementation.

Validation: existing Node test suite and `tests/product-guide-browser.mjs`.
The browser suite uses real page markup/CSS with isolated auth and action
fixtures (no real uploads, accounts or API mutations), covers all 13 pages at
1280/390/320px, replay/resume, modal coordination, session refresh, deduplication,
automatic dismissal and reduced motion. Set `L19_PLAYWRIGHT_MODULE` to an
installed Playwright module; optionally set `GUIDE_BROWSER_CHANNEL` and
`GUIDE_SCREENSHOTS`.
