#!/bin/bash
# RAJA GAMING — API E2E verification (dev only). Run: bash scripts/e2e/run.sh
set -u
BASE="http://localhost:3000"
J() { jq -r "$1" 2>/dev/null; }
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "PASS: $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL: $1"; }
check() {
  if [ "$2" == "$3" ]; then ok "$1"; else bad "$1 (got: $2, want: $3)"; fi
}

TS=$(date +%s)
UIDA="9876${TS: -6}"
U1="player1_${TS}@test.local"
U2="player2_${TS}@test.local"
COUPON="RAJA${TS: -6}"

echo "=== 1. AUTH ==="
R=$(curl -s -c /tmp/u1.jar -X POST $BASE/api/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Player One\",\"email\":\"$U1\",\"password\":\"Passw0rd123\"}")
check "register user1" "$(echo "$R" | J .ok)" "true"
U1CODE=$(curl -s -b /tmp/u1.jar $BASE/api/auth/me | J .data.user.referralCode)
R=$(curl -s -c /tmp/u2.jar -X POST $BASE/api/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Player Two\",\"email\":\"$U2\",\"password\":\"Passw0rd123\",\"referralCode\":\"$U1CODE\"}")
check "register user2 with referral" "$(echo "$R" | J .ok)" "true"
R=$(curl -s -c /dev/null -X POST $BASE/api/auth/register -H "Content-Type: application/json" -d "{\"name\":\"Dup Email\",\"email\":\"$U1\",\"password\":\"Passw0rd123\"}")
check "duplicate email rejected" "$(echo "$R" | J .ok)" "false"
R=$(curl -s -b /tmp/u1.jar $BASE/api/auth/me | J .data.user.email)
check "session works" "$R" "$U1"
R=$(curl -s $BASE/api/auth/me | J .data.user)
check "anonymous session null" "$R" "null"

echo "=== 2. ADMIN LOGIN ==="
R=$(curl -s -c /tmp/admin.jar -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@rajagaming.local","password":"RajaAdmin#2024"}')
check "admin login" "$(echo "$R" | J .data.user.role)" "ADMIN"
BASE_REV=$(curl -s -b /tmp/admin.jar $BASE/api/admin/stats | J .data.revenue)
R=$(curl -s -b /tmp/u1.jar $BASE/api/admin/stats)
check "admin API blocked for user" "$(echo "$R" | J .ok)" "false"

echo "=== 3. TOP-UP ORDER + PAYMENT + REFERRAL ==="
PKG=$(curl -s $BASE/api/packages | J '.data[1].id')
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/orders -H "Content-Type: application/json" -d "{\"packageId\":\"$PKG\",\"ffUid\":\"123456789\"}")
check "create order" "$(echo "$R" | J .ok)" "true"
ORDER=$(echo "$R" | J .data.id)
TOTAL=$(echo "$R" | J .data.totalAmount)
check "server-side price=200" "$TOTAL" "200"
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/orders/$ORDER/payment -H "Content-Type: application/json" -d '{"trxId":"EASYTRX-1001"}')
check "submit payment" "$(echo "$R" | J .data.status)" "PAYMENT_SUBMITTED"
R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/orders -H "Content-Type: application/json" -d "{\"orderId\":\"$ORDER\",\"action\":\"VERIFY\"}")
check "admin verify payment" "$(echo "$R" | J .data.status)" "APPROVED"
BAL=$(curl -s -b /tmp/u1.jar $BASE/api/wallet | J .data.wallet.balance)
check "referral reward credited (50)" "$BAL" "50"
R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/orders -H "Content-Type: application/json" -d "{\"orderId\":\"$ORDER\",\"action\":\"SET_STATUS\",\"status\":\"COMPLETED\"}")
check "order completed" "$(echo "$R" | J .data.status)" "COMPLETED"
R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/orders -H "Content-Type: application/json" -d "{\"orderId\":\"$ORDER\",\"action\":\"SET_STATUS\",\"status\":\"CANCELLED\"}")
check "invalid transition rejected" "$(echo "$R" | J .ok)" "false"

echo "=== 4. COUPON ==="
R=$(curl -s -b /tmp/admin.jar -X POST $BASE/api/admin/coupons -H "Content-Type: application/json" -d "{\"code\":\"$COUPON\",\"type\":\"PERCENTAGE\",\"value\":10,\"minOrder\":100,\"perUserLimit\":1,\"active\":true}")
check "create coupon" "$(echo "$R" | J .ok)" "true"
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/orders -H "Content-Type: application/json" -d "{\"packageId\":\"$PKG\",\"ffUid\":\"123456780\",\"couponCode\":\"$COUPON\"}")
DISC=$(echo "$R" | J .data.discount)
check "coupon discount=20" "$DISC" "20"
ORD2=$(echo "$R" | J .data.id)
curl -s -b /tmp/u2.jar -X POST $BASE/api/orders/$ORD2/payment -H "Content-Type: application/json" -d '{"trxId":"EASYTRX-1002"}' >/dev/null
curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/orders -H "Content-Type: application/json" -d "{\"orderId\":\"$ORD2\",\"action\":\"VERIFY\"}" >/dev/null
curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/orders -H "Content-Type: application/json" -d "{\"orderId\":\"$ORD2\",\"action\":\"SET_STATUS\",\"status\":\"COMPLETED\"}" >/dev/null
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/orders -H "Content-Type: application/json" -d "{\"packageId\":\"$PKG\",\"ffUid\":\"123456781\",\"couponCode\":\"$COUPON\"}")
check "per-user coupon limit enforced" "$(echo "$R" | J .ok)" "false"

echo "=== 5. TOURNAMENT ==="
START=$(date -u -d "+2 hours" +%Y-%m-%dT%H:%M:%SZ)
R=$(curl -s -b /tmp/admin.jar -X POST $BASE/api/admin/tournaments -H "Content-Type: application/json" -d "{\"title\":\"Raja Cup Squad #1\",\"description\":\"Weekly squad clash\",\"rules\":\"No hacks. Be in room 10 min early.\",\"mode\":\"SQUAD\",\"map\":\"BERMUDA\",\"entryFee\":50,\"prizePool\":\"1400 Diamonds\",\"perKillReward\":10,\"slots\":12,\"startsAt\":\"$START\"}")
check "create tournament" "$(echo "$R" | J .ok)" "true"
TOUR=$(echo "$R" | J .data.id)
TOUR=$(curl -s -b /tmp/admin.jar http://localhost:3000/api/admin/tournaments | J '.data.tournaments[0].id')
R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/tournaments -H "Content-Type: application/json" -d "{\"id\":\"$TOUR\",\"status\":\"OPEN\",\"roomCode\":\"RG777\",\"roomPassword\":\"king\",\"roomReleased\":true}")
check "tournament open + room set" "$(echo "$R" | J .ok)" "true"
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/tournaments/$TOUR/register -H "Content-Type: application/json" -d '{"inGameName":"PlayerTwoYT","ffUid":"123456789"}')
check "register tournament" "$(echo "$R" | J .ok)" "true"
REG=$(echo "$R" | J .data.id)
check "reg status PENDING_PAYMENT" "$(echo "$R" | J .data.status)" "PENDING_PAYMENT"
R=$(curl -s -b /tmp/u2.jar $BASE/api/tournaments/$TOUR)
check "room hidden before approval" "$(echo "$R" | J .data.room)" "null"
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/tournaments/$TOUR/payment -H "Content-Type: application/json" -d '{"trxId":"EASYTRX-2001"}')
check "tournament payment submitted" "$(echo "$R" | J .data.status)" "PAYMENT_SUBMITTED"
R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/tournament-registrations -H "Content-Type: application/json" -d "{\"registrationId\":\"$REG\",\"action\":\"APPROVE\"}")
check "registration approved" "$(echo "$R" | J .ok)" "true"
R=$(curl -s -b /tmp/u2.jar $BASE/api/tournaments/$TOUR)
check "room visible after approval" "$(echo "$R" | J .data.room.code)" "RG777"
check "my registration approved" "$(echo "$R" | J .data.myRegistration.status)" "APPROVED"
R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/tournament-registrations -H "Content-Type: application/json" -d "{\"registrationId\":\"$REG\",\"action\":\"SET_POSITION\",\"position\":1}")
check "set position" "$(echo "$R" | J .ok)" "true"
R=$(curl -s -b /tmp/admin.jar -X POST $BASE/api/admin/tournament-rewards -H "Content-Type: application/json" -d "{\"tournamentId\":\"$TOUR\",\"rewards\":[{\"position\":1,\"rewardType\":\"DIAMONDS\",\"diamondAmount\":355}]}")
check "set rewards" "$(echo "$R" | J .ok)" "true"

echo "=== 6. MARKETPLACE ==="
R=$(curl -s -b /tmp/u1.jar -X POST $BASE/api/marketplace/sell -H "Content-Type: application/json" -d "{\"title\":\"Level 62 Rare Bundle Account\",\"ffUid\":\"$UIDA\",\"description\":\"Rare bundle account with Evo gun skins and 20+ characters. Clean record, original email included.\",\"price\":1500,\"level\":62,\"screenshotUploadIds\":[]}")
check "create listing" "$(echo "$R" | J .ok)" "true"
LIST=$(echo "$R" | J .data.id)
PUBBASE=$(curl -s $BASE/api/marketplace | jq -r '.data | length')
R=$(curl -s $BASE/api/marketplace)
check "listing not public yet" "$(echo "$R" | J ".data | length")" "$PUBBASE"
R=$(curl -s -b /tmp/admin.jar "http://localhost:3000/api/admin/listings")
LIST=$(echo "$R" | jq -r --arg uid "$UIDA" '[.data.listings[] | select(.ffUid==$uid and .status=="PENDING")][0].id')
R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/listings -H "Content-Type: application/json" -d "{\"listingId\":\"$LIST\",\"action\":\"APPROVE\"}")
check "listing approved" "$(echo "$R" | J .data.listing.status)" "APPROVED"
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/marketplace/$LIST/purchase -H "Content-Type: application/json" -d '{"buyerNote":"Ready to buy today"}')
check "purchase requested" "$(echo "$R" | J .ok)" "true"
PUR=$(echo "$R" | J .data.id)
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/marketplace/$LIST/purchase -H "Content-Type: application/json" -d '{}')
check "second purchase blocked" "$(echo "$R" | J .ok)" "false"
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/marketplace/$LIST/payment -H "Content-Type: application/json" -d '{"trxId":"EASYTRX-3001"}')
check "purchase payment submitted" "$(echo "$R" | J .data.status)" "PAYMENT_SUBMITTED"
for A in VERIFY_PAYMENT OWNERSHIP_VERIFIED START_TRANSFER TRANSFER_VERIFIED COMPLETE; do
  R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/marketplace -H "Content-Type: application/json" -d "{\"purchaseId\":\"$PUR\",\"action\":\"$A\"}")
  ST=$(echo "$R" | J .data.purchase.status)
  if [ "$ST" == "null" ]; then bad "marketplace action $A"; else ok "marketplace action $A -> $ST"; fi
done
BAL1=$(curl -s -b /tmp/u1.jar $BASE/api/wallet | J .data.wallet.balance)
check "seller payout credited (50+1500=1550)" "$BAL1" "1550"
R=$(curl -s $BASE/api/marketplace | J ".data | length")
check "sold listing removed from public" "$R" "$PUBBASE"

echo "=== 7. DUPLICATE UID PROTECTION ==="
UIDB="555${TS: -6}"
R=$(curl -s -b /tmp/u1.jar -X POST $BASE/api/marketplace/sell -H "Content-Type: application/json" -d "{\"title\":\"Active UID Probe A\",\"ffUid\":\"$UIDB\",\"description\":\"Probe listing used to verify duplicate UID protection works correctly.\",\"price\":700,\"screenshotUploadIds\":[]}")
check "probe listing created" "$(echo "$R" | J .ok)" "true"
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/marketplace/sell -H "Content-Type: application/json" -d "{\"title\":\"Duplicate UID Probe B\",\"ffUid\":\"$UIDB\",\"description\":\"Second seller listing the same active uid must be flagged for admin review.\",\"price\":900,\"screenshotUploadIds\":[]}")
check "duplicate uid flagged" "$(echo "$R" | J .data.listing.status)" "DUPLICATE_REVIEW"
R=$(curl -s -b /tmp/u1.jar -X POST $BASE/api/marketplace/sell -H "Content-Type: application/json" -d "{\"title\":\"Own Duplicate Probe C\",\"ffUid\":\"$UIDB\",\"description\":\"Seller tries to relist the same uid while old one is still active.\",\"price\":800,\"screenshotUploadIds\":[]}")
check "own duplicate rejected" "$(echo "$R" | J .ok)" "false"

echo "=== 8. WALLET WITHDRAWAL ==="
R=$(curl -s -b /tmp/u1.jar -X POST $BASE/api/withdrawals -H "Content-Type: application/json" -d '{"amount":100,"accountName":"Player One","accountNumber":"03451234567"}')
check "withdrawal requested" "$(echo "$R" | J .ok)" "true"
WD=$(echo "$R" | J .data.withdrawal.id)
BAL1=$(curl -s -b /tmp/u1.jar $BASE/api/wallet | J .data.wallet.balance)
check "wallet debited (1550-100=1450)" "$BAL1" "1450"
R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/withdrawals -H "Content-Type: application/json" -d "{\"withdrawalId\":\"$WD\",\"action\":\"APPROVE\"}")
check "withdrawal approved" "$(echo "$R" | J .data.status)" "APPROVED"
R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/withdrawals -H "Content-Type: application/json" -d "{\"withdrawalId\":\"$WD\",\"action\":\"MARK_PAID\"}")
check "withdrawal marked paid" "$(echo "$R" | J .data.status)" "PAID"

echo "=== 9. REVIEWS ==="
R=$(curl -s -b /tmp/u2.jar -X POST $BASE/api/reviews -H "Content-Type: application/json" -d "{\"targetType\":\"TOPUP\",\"targetId\":\"$ORDER\",\"rating\":5,\"comment\":\"Diamonds delivered fast, great service!\"}")
check "review submitted" "$(echo "$R" | J .ok)" "true"
REV=$(echo "$R" | J .data.id)
PUBCOUNT=$(curl -s $BASE/api/reviews | jq -r --arg id "$REV" '[.data[] | select(.id==$id)] | length')
check "pending review not public" "$PUBCOUNT" "0"
R=$(curl -s -b /tmp/admin.jar -X PATCH $BASE/api/admin/reviews -H "Content-Type: application/json" -d "{\"reviewId\":\"$REV\",\"action\":\"APPROVE\"}")
check "review approved" "$(echo "$R" | J .ok)" "true"
PUBCOUNT=$(curl -s $BASE/api/reviews | jq -r --arg id "$REV" '[.data[] | select(.id==$id)] | length')
check "approved review public" "$PUBCOUNT" "1"

echo "=== 10. NOTIFICATIONS ==="
UN=$(curl -s -b /tmp/u1.jar $BASE/api/notifications | J .data.unreadCount)
if [ "${UN:-0}" -ge 1 ]; then ok "user1 has notifications ($UN unread)"; else bad "user1 notifications"; fi
R=$(curl -s -b /tmp/u1.jar -X POST $BASE/api/notifications -H "Content-Type: application/json" -d '{"action":"read_all"}')
check "mark all read" "$(echo "$R" | J .ok)" "true"

echo "=== 11. ADMIN STATS + AUDIT ==="
R=$(curl -s -b /tmp/admin.jar $BASE/api/admin/stats)
REV=$(echo "$R" | J .data.revenue)
DE=$(echo "$REV $BASE_REV" | awk '{print $1-$2}')
check "revenue delta = 380" "$DE" "380"
R=$(curl -s -b /tmp/admin.jar $BASE/api/admin/audit-logs)
N=$(echo "$R" | J ".data.logs | length")
if [ "${N:-0}" -ge 5 ]; then ok "audit logs populated ($N)"; else bad "audit logs ($N)"; fi

echo "=== 12. IDOR CHECKS ==="
R=$(curl -s -b /tmp/u1.jar $BASE/api/orders/$ORDER)
check "cannot read others order" "$(echo "$R" | J .ok)" "false"
R=$(curl -s -b /tmp/u2.jar $BASE/api/admin/users)
check "admin list blocked" "$(echo "$R" | J .ok)" "false"

echo ""
echo "RESULTS: PASS=$PASS FAIL=$FAIL"
