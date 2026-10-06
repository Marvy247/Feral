/*
 * TIP-1022 registration salt grinder.
 *
 *   registrationHash = keccak256(abi.encodePacked(masterAddress, salt))
 *   require(registrationHash bytes [0:4] == 0)   // 32-bit PoW
 *   masterId = registrationHash bytes [4:8]
 *
 * Usage:  ./grind <masterAddressHexWithout0x> <startIndex> <step>
 * Prints: salt=<64hex> masterId=<8hex>   (stdout) when found.
 *
 * Self-test:  ./grind --selftest   (verifies against known keccak-256
 * vectors, then vs an independent implementation is done by the caller)
 */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <time.h>

typedef uint64_t u64;
typedef uint8_t u8;

static const u64 RC[24] = {
    0x0000000000000001ULL, 0x0000000000008082ULL, 0x800000000000808aULL,
    0x8000000080008000ULL, 0x000000000000808bULL, 0x0000000080000001ULL,
    0x8000000080008081ULL, 0x8000000000008009ULL, 0x000000000000008aULL,
    0x0000000000000088ULL, 0x0000000080008009ULL, 0x000000008000000aULL,
    0x000000008000808bULL, 0x800000000000008bULL, 0x8000000000008089ULL,
    0x8000000000008003ULL, 0x8000000000008002ULL, 0x8000000000000080ULL,
    0x000000000000800aULL, 0x800000008000000aULL, 0x8000000080008081ULL,
    0x8000000000008080ULL, 0x0000000080000001ULL, 0x8000000080008008ULL
};

static const int ROTC[24] = {
    1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14,
    27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44
};
static const int PILN[24] = {
    10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4,
    15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1
};

static inline u64 rotl64(u64 x, int y) { return (x << y) | (x >> (64 - y)); }

static void keccakf(u64 st[25]) {
    u64 bc[5], t;
    for (int round = 0; round < 24; round++) {
        /* theta */
        for (int i = 0; i < 5; i++)
            bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20];
        for (int i = 0; i < 5; i++) {
            t = bc[(i + 4) % 5] ^ rotl64(bc[(i + 1) % 5], 1);
            for (int j = 0; j < 25; j += 5) st[j + i] ^= t;
        }
        /* rho + pi */
        t = st[1];
        for (int i = 0; i < 24; i++) {
            int j = PILN[i];
            u64 tmp = st[j];
            st[j] = rotl64(t, ROTC[i]);
            t = tmp;
        }
        /* chi */
        for (int j = 0; j < 25; j += 5) {
            u64 row[5];
            for (int i = 0; i < 5; i++) row[i] = st[j + i];
            for (int i = 0; i < 5; i++)
                st[j + i] = row[i] ^ ((~row[(i + 1) % 5]) & row[(i + 2) % 5]);
        }
        /* iota */
        st[0] ^= RC[round];
    }
}

/* keccak-256 of a 52-byte message (single rate block) -> 32 bytes out */
static void keccak256_52(const u8 in52[52], u8 out[32]) {
    u64 st[25];
    memset(st, 0, sizeof(st));
    u8 block[136];
    memset(block, 0, sizeof(block));
    memcpy(block, in52, 52);
    block[52] = 0x01;           /* keccak pad (not SHA3's 0x06) */
    block[135] |= 0x80;         /* multi-rate padding end */
    for (int i = 0; i < 17; i++) {  /* 136 bytes = 17 words */
        u64 w = 0;
        for (int b = 0; b < 8; b++) w |= (u64)block[i * 8 + b] << (8 * b);
        st[i] ^= w;
    }
    keccakf(st);
    for (int i = 0; i < 4; i++)
        for (int b = 0; b < 8; b++)
            out[i * 8 + b] = (u8)(st[i] >> (8 * b));
}

static int hexval(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static void to_hex(const u8 *b, int n, char *out) {
    static const char H[] = "0123456789abcdef";
    for (int i = 0; i < n; i++) { out[i * 2] = H[b[i] >> 4]; out[i * 2 + 1] = H[b[i] & 15]; }
    out[n * 2] = 0;
}

static int selftest(void) {
    u8 out[32];
    u8 empty[52];
    memset(empty, 0, 52);
    keccak256_52(empty, out); /* wrong input length for "" vector — build proper vectors below */

    /* vector: keccak256("abc") with proper 3-byte message */
    u8 msg[52];
    memset(msg, 0, 52);
    /* use generic single-block function for arbitrary len<=135 via temp impl */
    extern void keccak256_generic(const u8 *in, int len, u8 out[32]);
    keccak256_generic((const u8 *)"abc", 3, out);
    const char *exp_abc = "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45";
    char got[65];
    to_hex(out, 32, got);
    if (strcmp(got, exp_abc) != 0) {
        printf("SELFTEST FAIL abc: %s\n", got);
        return 1;
    }
    keccak256_generic((const u8 *)"", 0, out);
    /* reference value cross-checked against js-sha3's keccak256("") */
    const char *exp_empty = "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
    to_hex(out, 32, got);
    if (strcmp(got, exp_empty) != 0) {
        printf("SELFTEST FAIL empty: %s\n", got);
        return 1;
    }
    printf("SELFTEST OK\n");
    return 0;
}

void keccak256_generic(const u8 *in, int len, u8 out[32]) {
    u64 st[25];
    memset(st, 0, sizeof(st));
    u8 block[136];
    memset(block, 0, sizeof(block));
    memcpy(block, in, len);
    block[len] = 0x01;
    block[135] |= 0x80;
    for (int i = 0; i < 17; i++) {
        u64 w = 0;
        for (int b = 0; b < 8; b++) w |= (u64)block[i * 8 + b] << (8 * b);
        st[i] ^= w;
    }
    keccakf(st);
    for (int i = 0; i < 4; i++)
        for (int b = 0; b < 8; b++)
            out[i * 8 + b] = (u8)(st[i] >> (8 * b));
}

int main(int argc, char **argv) {
    if (argc == 2 && strcmp(argv[1], "--selftest") == 0) return selftest();    if (argc == 3 && strcmp(argv[1], "--hash") == 0) {
        /* hash arbitrary-length hex message (for cross-checking vs js-sha3) */
        int len = strlen(argv[2]) / 2;
        u8 msg[256], out[32];
        if (len > 256) { fprintf(stderr, "too long\n"); return 2; }
        for (int i = 0; i < len; i++) {
            int hi = hexval(argv[2][i * 2]), lo = hexval(argv[2][i * 2 + 1]);
            if (hi < 0 || lo < 0) { fprintf(stderr, "bad hex\n"); return 2; }
            msg[i] = (u8)((hi << 4) | lo);
        }
        keccak256_generic(msg, len, out);
        char s[65];
        to_hex(out, 32, s);
        printf("%s\n", s);
        return 0;
    }
    if (argc == 4 && strcmp(argv[1], "--packed") == 0) {
        /* debug: print keccak256_52(addr||salt(idx)) for cross-checking */
        u8 pre[52]; memset(pre, 0, 52);
        if (strlen(argv[2]) != 40) { fprintf(stderr, "address must be 40 hex chars\n"); return 2; }
        for (int i = 0; i < 20; i++) {
            int hi = hexval(argv[2][i * 2]), lo = hexval(argv[2][i * 2 + 1]);
            if (hi < 0 || lo < 0) { fprintf(stderr, "bad hex\n"); return 2; }
            pre[i] = (u8)((hi << 4) | lo);
        }
        u64 idx = strtoull(argv[3], NULL, 10);
        u8 *salt = pre + 20;
        u64 v = idx;
        for (int i = 31; i >= 0 && v; i--) { salt[i] = (u8)(v & 0xff); v >>= 8; }
        u8 out[32]; char s[65];
        keccak256_52(pre, out);
        to_hex(out, 32, s);
        printf("%s\n", s);
        return 0;
    }
    if (argc != 4 && argc != 5) {
        fprintf(stderr, "usage: %s <addr40hex> <startIndex> <step> [stateFile] | %s --selftest | %s --hash <hex>\n", argv[0], argv[0], argv[0]);
        return 2;
    }
    u8 pre[52];
    if (strlen(argv[1]) != 40) { fprintf(stderr, "address must be 40 hex chars\n"); return 2; }
    for (int i = 0; i < 20; i++) {
        int hi = hexval(argv[1][i * 2]), lo = hexval(argv[1][i * 2 + 1]);
        if (hi < 0 || lo < 0) { fprintf(stderr, "bad hex\n"); return 2; }
        pre[i] = (u8)((hi << 4) | lo);
    }
    u64 idx = strtoull(argv[2], NULL, 10);
    u64 step = strtoull(argv[3], NULL, 10);

    /* optional state file: resume from saved index, checkpoint every ~2s
       so interrupted runs (session restarts) never lose progress */
    const char *state_path = (argc == 5) ? argv[4] : NULL;
    FILE *sf = NULL;
    if (state_path) {
        FILE *rf = fopen(state_path, "r");
        if (rf) {
            u64 saved = 0;
            if (fscanf(rf, "%llu", &saved) == 1 && saved > idx) idx = saved;
            fclose(rf);
        }
        sf = fopen(state_path, "w");
    }

    u8 out[32];
    u64 tried = 0;
    time_t last = time(NULL);
    for (;;) {
        /* salt = 32-byte big-endian(idx) at pre[20..51] */
        u8 *salt = pre + 20;
        memset(salt, 0, 32);
        u64 v = idx;
        for (int i = 31; i >= 0 && v; i--) { salt[i] = (u8)(v & 0xff); v >>= 8; }

        keccak256_52(pre, out);
        if (out[0] == 0 && out[1] == 0 && out[2] == 0 && out[3] == 0) {
            char salts[65], mid[9];
            to_hex(salt, 32, salts);
            to_hex(out + 4, 4, mid);
            printf("salt=0x%s masterId=0x%s\n", salts, mid);
            fflush(stdout);
            if (sf) fclose(sf);
            return 0;
        }
        idx += step;
        tried++;
        if (time(NULL) != last) {
            last = time(NULL);
            if (sf) { fseek(sf, 0, SEEK_SET); fprintf(sf, "%llu\n", (unsigned long long)idx); fflush(sf); }
        }
    }
}
