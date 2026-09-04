# LegaRya Frontend

LegaRya is the product served from `https://waffleberry.app` and
`https://www.waffleberry.app`.

The site is a static frontend deployed by the repository's existing Vercel
project. Production API requests use the WaffleBerry Hetzner backend endpoint;
local development uses `http://localhost:8100/api/v1`.

Run the automated frontend tests with:

```powershell
$tests = Get-ChildItem .\tests -Filter *.test.mjs | Select-Object -Expand FullName
node --test $tests
```
