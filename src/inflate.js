/* ==========================================================================
   Décompression gzip/DEFLATE (RFC 1951 / 1952) — implémentation autonome.
   Permet d'embarquer la Bible compressée dans le fichier HTML unique, sans
   aucune dépendance ni requête réseau.
   Expose : window.gunzipToString(Uint8Array) -> string (UTF-8)
   ========================================================================== */
(function () {
  "use strict";

  var LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35,
    43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3,
    4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289,
    16385, 24577];
  var DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8,
    9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14,
    1, 15];

  /* Construit les tables de décodage canonique de Huffman. */
  function buildHuffman(lengths) {
    var maxBits = 0, i;
    for (i = 0; i < lengths.length; i++) {
      if (lengths[i] > maxBits) maxBits = lengths[i];
    }
    var blCount = new Int32Array(maxBits + 1);
    for (i = 0; i < lengths.length; i++) blCount[lengths[i]]++;
    blCount[0] = 0;

    var nextCode = new Int32Array(maxBits + 2);
    var code = 0;
    for (i = 1; i <= maxBits; i++) {
      code = (code + blCount[i - 1]) << 1;
      nextCode[i] = code;
    }
    // table : premier code et premier index de symbole pour chaque longueur
    var counts = new Int32Array(maxBits + 1);
    var offsets = new Int32Array(maxBits + 2);
    for (i = 1; i <= maxBits; i++) offsets[i + 1] = offsets[i] + blCount[i];
    var symbols = new Int32Array(lengths.length);
    for (i = 0; i < lengths.length; i++) {
      if (lengths[i]) symbols[offsets[lengths[i]] + counts[lengths[i]]++] = i;
    }
    return { counts: blCount, symbols: symbols, maxBits: maxBits };
  }

  function Reader(data) {
    this.d = data;
    this.pos = 0;
    this.bit = 0;
    this.buf = 0;
    this.cnt = 0;
  }

  Reader.prototype.bits = function (n) {
    while (this.cnt < n) {
      if (this.pos >= this.d.length) throw new Error("données tronquées");
      this.buf |= this.d[this.pos++] << this.cnt;
      this.cnt += 8;
    }
    var v = this.buf & ((1 << n) - 1);
    this.buf >>>= n;
    this.cnt -= n;
    return v;
  };

  Reader.prototype.decode = function (h) {
    var code = 0, first = 0, index = 0;
    for (var len = 1; len <= h.maxBits; len++) {
      code |= this.bits(1);
      var count = h.counts[len];
      if (code - first < count) return h.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error("code Huffman invalide");
  };

  var FIXED_LIT = null, FIXED_DIST = null;
  function fixedTables() {
    if (FIXED_LIT) return;
    var l = new Uint8Array(288), i;
    for (i = 0; i < 144; i++) l[i] = 8;
    for (i = 144; i < 256; i++) l[i] = 9;
    for (i = 256; i < 280; i++) l[i] = 7;
    for (i = 280; i < 288; i++) l[i] = 8;
    FIXED_LIT = buildHuffman(l);
    var d = new Uint8Array(30);
    for (i = 0; i < 30; i++) d[i] = 5;
    FIXED_DIST = buildHuffman(d);
  }

  function inflateRaw(data) {
    var r = new Reader(data);
    var out = new Uint8Array(Math.max(1024, data.length * 5));
    var len = 0;

    function grow(need) {
      if (len + need <= out.length) return;
      var size = out.length;
      while (size < len + need) size *= 2;
      var n = new Uint8Array(size);
      n.set(out.subarray(0, len));
      out = n;
    }

    for (;;) {
      var last = r.bits(1);
      var type = r.bits(2);

      if (type === 0) {
        // bloc non compressé : aligner sur l'octet
        r.buf = 0;
        r.cnt = 0;
        if (r.pos + 4 > r.d.length) throw new Error("données tronquées");
        var l = r.d[r.pos] | (r.d[r.pos + 1] << 8);
        r.pos += 4;
        grow(l);
        out.set(r.d.subarray(r.pos, r.pos + l), len);
        len += l;
        r.pos += l;
      } else if (type === 1 || type === 2) {
        var lit, dist;
        if (type === 1) {
          fixedTables();
          lit = FIXED_LIT;
          dist = FIXED_DIST;
        } else {
          var hlit = r.bits(5) + 257;
          var hdist = r.bits(5) + 1;
          var hclen = r.bits(4) + 4;
          var clens = new Uint8Array(19);
          for (var i = 0; i < hclen; i++) clens[CLEN_ORDER[i]] = r.bits(3);
          var ch = buildHuffman(clens);
          var lens = new Uint8Array(hlit + hdist);
          var n = 0;
          while (n < hlit + hdist) {
            var sym = r.decode(ch);
            if (sym < 16) {
              lens[n++] = sym;
            } else if (sym === 16) {
              if (n === 0) throw new Error("répétition sans précédent");
              var prev = lens[n - 1];
              var rep = 3 + r.bits(2);
              while (rep--) lens[n++] = prev;
            } else if (sym === 17) {
              var rep17 = 3 + r.bits(3);
              while (rep17--) lens[n++] = 0;
            } else {
              var rep18 = 11 + r.bits(7);
              while (rep18--) lens[n++] = 0;
            }
          }
          lit = buildHuffman(lens.subarray(0, hlit));
          dist = buildHuffman(lens.subarray(hlit));
        }

        for (;;) {
          var s = r.decode(lit);
          if (s < 256) {
            grow(1);
            out[len++] = s;
          } else if (s === 256) {
            break;
          } else {
            s -= 257;
            if (s >= LEN_BASE.length) throw new Error("longueur invalide");
            var length = LEN_BASE[s] + r.bits(LEN_EXTRA[s]);
            var ds = r.decode(dist);
            var distance = DIST_BASE[ds] + r.bits(DIST_EXTRA[ds]);
            if (distance > len) throw new Error("distance invalide");
            grow(length);
            var from = len - distance;
            for (var k = 0; k < length; k++) out[len++] = out[from + k];
          }
        }
      } else {
        throw new Error("type de bloc réservé");
      }
      if (last) break;
    }
    return out.subarray(0, len);
  }

  function gunzip(bytes) {
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error("en-tête gzip absent");
    if (bytes[2] !== 8) throw new Error("compression gzip inconnue");
    var flg = bytes[3];
    var p = 10;
    if (flg & 4) { p += 2 + (bytes[p] | (bytes[p + 1] << 8)); }   // FEXTRA
    if (flg & 8) { while (bytes[p]) p++; p++; }                   // FNAME
    if (flg & 16) { while (bytes[p]) p++; p++; }                  // FCOMMENT
    if (flg & 2) { p += 2; }                                      // FHCRC
    return inflateRaw(bytes.subarray(p));
  }

  function utf8(bytes) {
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("utf-8").decode(bytes);
    }
    var s = "", i = 0, c, c2, c3;
    while (i < bytes.length) {
      c = bytes[i++];
      if (c < 128) s += String.fromCharCode(c);
      else if (c < 224) { c2 = bytes[i++]; s += String.fromCharCode(((c & 31) << 6) | (c2 & 63)); }
      else if (c < 240) {
        c2 = bytes[i++]; c3 = bytes[i++];
        s += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
      } else {
        c2 = bytes[i++]; c3 = bytes[i++];
        var c4 = bytes[i++];
        var cp = ((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63);
        cp -= 0x10000;
        s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
      }
    }
    return s;
  }

  window.gunzipToString = function (bytes) { return utf8(gunzip(bytes)); };
  window.__inflateRaw = inflateRaw;
})();
