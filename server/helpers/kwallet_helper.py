#!/usr/bin/python3
import json
import sys
import dbus

WALLET = "kdewallet"
FOLDER = "DailyHorse"
APP = "DailyHorse"

def fail(code):
    sys.stdout.write(json.dumps({"ok": False, "code": code}))
    sys.exit(1)

try:
    request = json.load(sys.stdin)
    operation = request.get("operation")
    entry = request.get("entry", "")
    if operation not in {"has", "write", "read", "remove"} or not isinstance(entry, str) or len(entry) > 200:
        fail("invalid_request")
    bus = dbus.SessionBus()
    wallet = dbus.Interface(bus.get_object("org.kde.kwalletd5", "/modules/kwalletd5"), "org.kde.KWallet")
    handle = wallet.open(WALLET, dbus.Int64(0), APP)
    if handle < 0:
        fail("wallet_open_failed")
    if not wallet.hasFolder(handle, FOLDER, APP) and not wallet.createFolder(handle, FOLDER, APP):
        fail("folder_unavailable")
    exists = bool(wallet.hasEntry(handle, FOLDER, entry, APP))
    if operation == "has":
        print(json.dumps({"ok": True, "exists": exists}))
    elif operation == "write":
        secret = request.get("secret")
        if not isinstance(secret, str) or "\n" in secret or "\r" in secret:
            fail("invalid_secret")
        if wallet.writePassword(handle, FOLDER, entry, secret, APP) != 0:
            fail("write_failed")
        stored = str(wallet.readPassword(handle, FOLDER, entry, APP))
        print(json.dumps({"ok": stored == secret, "verified": stored == secret}))
    elif operation == "read":
        if not exists:
            fail("entry_missing")
        print(json.dumps({"ok": True, "secret": str(wallet.readPassword(handle, FOLDER, entry, APP))}))
    else:
        if exists and wallet.removeEntry(handle, FOLDER, entry, APP) != 0:
            fail("delete_failed")
        print(json.dumps({"ok": True, "exists": False}))
except Exception:
    fail("credential_store_unavailable")
