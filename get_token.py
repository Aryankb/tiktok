"""
Run this once to exchange your auth code for access_token + shop_cipher.

Steps:
  1. Open this URL in browser (VPN OFF, client logged into seller-sg.tiktok.com):
     https://auth.tiktok-shops.com/oauth/authorize?app_key=6kp5cm6iilt3n&state=test

  2. Authorize the app — browser will redirect to something like:
     https://localhost?code=ROW_XXXXXXXXXXXX&state=test
     (page will fail to load — that's fine, just copy the 'code' from the URL bar)

  3. Run:
     python get_token.py ROW_XXXXXXXXXXXX
"""

import sys
import hashlib
import hmac
import json
import time
import urllib.request
import urllib.parse

APP_KEY    = "6kp5cm6iilt3n"
APP_SECRET = "1e6d28e78fdd09ad6aad375313d11ea97de19a99"

def get_token(auth_code: str):
    url = "https://auth.tiktok-shops.com/api/v2/token/get"

    params = {
        "app_key": APP_KEY,
        "app_secret": APP_SECRET,
        "auth_code": auth_code,
        "grant_type": "authorized_code",
    }

    qs = urllib.parse.urlencode(params)
    full_url = f"{url}?{qs}"

    print(f"\nCalling: {url}")
    req = urllib.request.Request(full_url, method="GET")
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())

    print("\n=== Raw response ===")
    print(json.dumps(data, indent=2))

    if data.get("code") != 0:
        print(f"\nERROR: {data.get('message')} (code {data.get('code')})")
        return

    d = data.get("data", {})
    access_token  = d.get("access_token")
    refresh_token = d.get("refresh_token")
    seller_name   = d.get("seller_name") or d.get("seller_base_region") or ""
    expires_in    = d.get("access_token_expire_in") or d.get("expires_in") or ""

    # Shop cipher lives inside the authorized_shop list
    shops = d.get("authorized_shop_list") or d.get("shops") or []
    cipher = shops[0].get("cipher") if shops else None
    shop_id = shops[0].get("shop_id") if shops else None
    shop_name = shops[0].get("shop_name") if shops else None

    print("\n" + "="*50)
    print("SUCCESS! Copy these into your .env file:")
    print("="*50)
    print(f"TIKTOK_ACCESS_TOKEN={access_token}")
    print(f"TIKTOK_SHOP_CIPHER={cipher}")
    print("="*50)
    print(f"\nShop name  : {shop_name}")
    print(f"Shop ID    : {shop_id}")
    print(f"Seller     : {seller_name}")
    print(f"Token expires in: {expires_in} seconds")
    if refresh_token:
        print(f"\nRefresh token (save this for later): {refresh_token}")

    if len(shops) > 1:
        print("\nMultiple shops found:")
        for s in shops:
            print(f"  - {s.get('shop_name')} | cipher: {s.get('cipher')}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    get_token(sys.argv[1].strip())
