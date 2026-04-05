# CDM STORES — Pre-Deploy Audit CLI
param([switch]$Json)
Set-Location (Split-Path $MyInvocation.MyCommand.Path)
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$results = [System.Collections.ArrayList]::new()

function Chk {
    param([string]$Label, [string]$File, [string]$Pattern, [bool]$ShouldMatch = $true)
    $content = Get-Content $File -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if ($null -eq $content) {
        [void]$results.Add([PSCustomObject]@{ Status="FAIL"; Label=$Label; Reason="File not found: $File" })
        return
    }
    $matched = [bool]($content -match $Pattern)
    $pass    = ($ShouldMatch -and $matched) -or (-not $ShouldMatch -and -not $matched)
    $reason  = if (-not $pass) { "Expected shouldMatch=$ShouldMatch for pattern /$Pattern/" } else { "" }
    [void]$results.Add([PSCustomObject]@{ Status=if($pass){"OK"}else{"FAIL"}; Label=$Label; Reason=$reason })
}

# [1] Navigation
Chk  "EN default lang (index.html)"       "index.html"              'lang="en"'
Chk  "#sobre section exists"              "index.html"              'id="sobre"'
Chk  "#contato section exists"            "index.html"              'id="contato"'
Chk  "Main navigation aria-label"         "index.html"              'Main navigation|aria-label="Main'

# [2] Currency / USD
Chk  "No R$ in index.html"               "index.html"              'R\$'                $false
Chk  'USD promo bar ($199)'              "index.html"              '\$199'
Chk  "No R$ in checkout.html"            "pages/checkout.html"     'R\$'                $false
Chk  "No R$ in frontend-integration.js"  "frontend-integration.js" 'R\$'                $false

# [3] Authentication
Chk  "Sign In button (auth.js)"           "js/auth.js"              'Sign In'
Chk  "Create Account (auth.js)"           "js/auth.js"              'Create Account'
Chk  "Continue with Google (auth.js)"     "js/auth.js"              'Continue with Google'
Chk  "Country default: United States"     "js/auth.js"              'United States'
Chk  "No BR-specific CEP check"           "js/auth.js"              'cep|CEP'            $false

# [4] Chatbot / Payment methods
Chk  "No PIX in chatbot.js"              "js/chatbot.js"           'PIX|Pix'            $false
Chk  "No PIX in script.js"              "js/script.js"            'PIX|Pix'            $false
Chk  "No Boleto in index.html"           "index.html"              '[Bb]oleto'          $false

# [5] Stripe
Chk  "Pay with Stripe button"            "pages/checkout.html"     'Pay with Stripe'
Chk  "Stripe.js loaded"                  "pages/checkout.html"     'js\.stripe\.com'
Chk  "No PayPal in checkout"            "pages/checkout.html"     '[Pp]ay[Pp]al'       $false

# [6] Shipping logic
Chk  "Free shipping at subtotal>=199"    "frontend-integration.js" 'subtotal >= 199'
Chk  "Shipping fallback \$9.99"          "frontend-integration.js" '9\.99'
Chk  "No hardcoded R\$ 15"              "frontend-integration.js" 'R\$\s*15'           $false

# [7] Responsiveness
Chk  "mobile.css linked"                 "index.html"              'mobile\.css'
Chk  "Viewport meta tag"                 "index.html"              'name="viewport"'

# [8] i18n
Chk  "detectLang() returns 'en'"         "js/script.js"            "return ['\`"]en['\`"]"
Chk  "EN lang button active (index)"     "index.html"              'data-lang="en"'
Chk  "EN lang active (checkout)"         "pages/checkout.html"     'data-lang="en"'

# [9] Security
Chk  "No inline Stripe live secret"      "index.html"              'sk_live|sk_test|whsec_'  $false
Chk  "No inline secret in auth.js"       "js/auth.js"              'sk_live|sk_test'         $false
Chk  "HTTPS API base URL"                "js/auth.js"              'https://cdmstores\.com/api'
Chk  "Fetch uses credentials:include"    "js/auth.js"              "credentials.*['\`"]include['\`"]"

# ── Summary ──────────────────────────────────────────────────────────────────
$ok   = ($results | Where-Object { $_.Status -eq "OK"   }).Count
$fail = ($results | Where-Object { $_.Status -eq "FAIL" }).Count

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        CDM STORES — Pre-Deploy Audit Report              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "  Timestamp : $ts"
Write-Host ""

$categories = @(
    @{Name="[1] Navigation";       From=0;  Count=4},
    @{Name="[2] Currency/USD";     From=4;  Count=4},
    @{Name="[3] Authentication";   From=8;  Count=5},
    @{Name="[4] Chatbot/Payment";  From=13; Count=3},
    @{Name="[5] Stripe";           From=16; Count=3},
    @{Name="[6] Shipping Logic";   From=19; Count=3},
    @{Name="[7] Responsiveness";   From=22; Count=2},
    @{Name="[8] i18n";             From=24; Count=3},
    @{Name="[9] Security";         From=27; Count=4}
)

foreach ($cat in $categories) {
    Write-Host "  $($cat.Name)" -ForegroundColor Yellow
    $slice = $results | Select-Object -Skip $cat.From -First $cat.Count
    foreach ($r in $slice) {
        if ($r.Status -eq "OK") {
            Write-Host "    [  OK  ] $($r.Label)" -ForegroundColor Green
        } else {
            Write-Host "    [ FAIL ] $($r.Label)" -ForegroundColor Red
            if ($r.Reason) { Write-Host "             $($r.Reason)" -ForegroundColor DarkRed }
        }
    }
}

Write-Host ""
$color = if ($fail -eq 0) { "Green" } else { "Yellow" }
Write-Host "  ── SCORE: $ok / $($ok + $fail) checks passed ──" -ForegroundColor $color
if ($fail -eq 0) {
    Write-Host "  Ready for deployment." -ForegroundColor Green
} else {
    Write-Host "  $fail check(s) failed. Review above before deploying." -ForegroundColor Red

}
Write-Host ""
