#!/usr/bin/env python3
# SPDX-License-Identifier: MS-PL
#
# Upstream finding 29's reproduction, kept runnable so the sequence can be re-measured whenever
# `cnanext` moves. It calls the C ABI directly through ctypes rather than as a compiled probe,
# because nothing here needs building: the whole point is that these are four public C calls and
# that the third one is a route a binding must not make.
#
# It mirrors `modules/c-api/tests/pure_c/NetSmoke.c`'s own sequence. Every out-parameter is poisoned
# before its call and read after it, never in the same expression that fills it -- C leaves argument
# evaluation order unspecified, and reading an out-parameter in the call that writes it has produced
# two wrong readings in this project already.
#
#   python3 tools/upstream-repro/net-signed-in-gamer.py /path/to/libcna_c_api.so
#
import ctypes, sys

class StringView(ctypes.Structure):
    _fields_ = [("data", ctypes.c_char_p), ("byte_length", ctypes.c_uint64)]

lib = ctypes.CDLL(sys.argv[1])
SUCCESS, INVALID_ARGUMENT = 0, 1
LOCAL, PLAYER_ONE, INVALID_HANDLE = 0, 0, 0

def out_i32(fn, *a):
    v = ctypes.c_int32(-12345)
    r = fn(*a, ctypes.byref(v))
    return r, v.value

def out_h(fn, *a):
    h = ctypes.c_uint64(0xDEADBEEF)          # poisoned before the call
    r = fn(*a, ctypes.byref(h))
    return r, h.value

print("1. how many gamers are signed in?")
r, n = out_i32(lib.cna_gamer_get_signed_in_gamer_count)
print(f"   cna_gamer_get_signed_in_gamer_count -> result {r}, count {n}")

print("2. create a Local session with no gamer signed in")
lib.cna_network_session_create.argtypes = [ctypes.c_uint32, ctypes.c_int32, ctypes.c_int32,
                                           ctypes.POINTER(ctypes.c_uint64)]
r, h = out_h(lib.cna_network_session_create, ctypes.c_uint32(LOCAL), ctypes.c_int32(1), ctypes.c_int32(4))
print(f"   cna_network_session_create -> result {r} "
      f"({'INVALID_ARGUMENT' if r == INVALID_ARGUMENT else r}), handle {h}")

print("3. publish a gamer through the PLATFORM-LAYER route -- the one a binding must not call")
lib.cna_signed_in_gamer_create_ext.argtypes = [StringView, ctypes.c_int32, ctypes.c_int32,
                                               ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint64)]
tag = b"Player"
r, gamer = out_h(lib.cna_signed_in_gamer_create_ext,
                 StringView(tag, len(tag)), ctypes.c_int32(0), ctypes.c_int32(0),
                 ctypes.c_uint32(PLAYER_ONE))
print(f"   cna_signed_in_gamer_create_ext -> result {r}, gamer {'valid' if gamer else 'INVALID'}")
arr = (ctypes.c_uint64 * 1)(gamer)
lib.cna_gamer_set_signed_in_gamers_ext.argtypes = [ctypes.POINTER(ctypes.c_uint64), ctypes.c_uint64]
r2 = lib.cna_gamer_set_signed_in_gamers_ext(arr, ctypes.c_uint64(1))
r3, n2 = out_i32(lib.cna_gamer_get_signed_in_gamer_count)
print(f"   cna_gamer_set_signed_in_gamers_ext -> result {r2}; count is now {n2}")

print("4. the identical session create, now that a gamer exists")
r, h = out_h(lib.cna_network_session_create, ctypes.c_uint32(LOCAL), ctypes.c_int32(2), ctypes.c_int32(8))
print(f"   cna_network_session_create -> result {r} "
      f"({'SUCCESS' if r == SUCCESS else r}), handle {'valid' if h else 'INVALID'}")
