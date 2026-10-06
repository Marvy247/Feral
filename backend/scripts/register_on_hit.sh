#!/usr/bin/env bash
# Waits for a grind worker to find a TIP-1022 registration salt, then:
#   1. stops the remaining workers
#   2. calls registerVirtualMaster(bytes32) on the registry precompile
#   3. writes VIRTUAL_MASTER_ID (8 hex chars, no 0x) into backend/.env
#   4. touches /tmp/grind_registered.done  (signals the caller to restart backend)
# Designed to run detached (setsid nohup) so it survives session restarts.
set -uo pipefail

LOG=/tmp/grind_monitor.log
DONE=/tmp/grind_registered.done
ADDR=27a2dd1823d883935c9824fbac0a018ce8e891e5
REGISTRY=0xFDC0000000000000000000000000000000000000

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ENV_FILE="$SCRIPT_DIR/../.env"            # backend/.env
CONTRACTS_ENV="$SCRIPT_DIR/../../contracts/.env"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

if [ ! -f "$CONTRACTS_ENV" ]; then
  log "FATAL: contracts env not found at $CONTRACTS_ENV"
  exit 1
fi

[ -f "$DONE" ] && { log "already registered (done flag exists), exiting"; exit 0; }

log "monitor started (pid $$)"

# --- 1. wait for a hit -------------------------------------------------------
HIT=""
while [ -z "$HIT" ]; do
  for f in /tmp/grind_[0-9].out; do
    [ -s "$f" ] || continue
    if grep -q 'salt=0x' "$f" 2>/dev/null; then
      HIT=$(grep -m1 'salt=0x' "$f")
      break
    fi
  done
  [ -z "$HIT" ] && sleep 5
done
log "HIT: $HIT"

SALT=$(echo "$HIT"   | sed -n 's/.*salt=\(0x[0-9a-f]\{64\}\).*/\1/p')
MID_RAW=$(echo "$HIT" | sed -n 's/.*masterId=\(0x[0-9a-f]\{8\}\).*/\1/p')
MID=${MID_RAW#0x}
if [ -z "$SALT" ] || [ -z "$MID" ]; then
  log "could not parse hit, exiting for manual handling"
  exit 1
fi
log "salt=$SALT masterId=$MID"

# --- 2. stop the remaining workers ------------------------------------------
pkill -f "grind $ADDR" 2>/dev/null && log "stopped remaining workers"
sleep 1

# --- 3. register on-chain ----------------------------------------------------
set -a; . "$CONTRACTS_ENV"; set +a
TX=""
for attempt in 1 2 3; do
  OUT=$(cast send "$REGISTRY" "registerVirtualMaster(bytes32)" "$SALT" \
        --rpc-url "$TEMPO_RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" \
        --gas-limit 500000 2>&1)
  RC=$?
  log "cast attempt $attempt rc=$RC"
  log "$OUT"
  if [ $RC -eq 0 ]; then
    TX=$(echo "$OUT" | grep -o '0x[0-9a-f]\{64\}' | head -1)
    break
  fi
  # a revert is a real on-chain failure (not transient) — don't retry blindly
  echo "$OUT" | grep -qiE 'revert|ExecutionFailed|ProofOfWorkFailed' && break
  sleep 5
done
if [ $RC -ne 0 ]; then
  log "REGISTRATION FAILED — manual intervention needed"
  exit 1
fi

# --- 4. write env + flag -----------------------------------------------------
if grep -q '^VIRTUAL_MASTER_ID=' "$ENV_FILE"; then
  sed -i "s/^VIRTUAL_MASTER_ID=.*/VIRTUAL_MASTER_ID=$MID/" "$ENV_FILE"
else
  printf 'VIRTUAL_MASTER_ID=%s\n' "$MID" >> "$ENV_FILE"
fi
log "wrote VIRTUAL_MASTER_ID=$MID to $ENV_FILE"

{
  echo "salt=$SALT"
  echo "masterId=$MID"
  echo "tx=$TX"
} > "$DONE"
log "done flag written — backend must now be restarted to pick up the env var"
