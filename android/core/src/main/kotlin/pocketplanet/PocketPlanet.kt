// Pocket Planet core for Android: a line-by-line Kotlin port of ../../../../../../planet.js
// (plus the close-up wallpaper layout from windows/wallpaper-main.js).
// The same seed gives the same planet here as on iPhone and Windows, so keep the
// order of random calls identical to the JavaScript when changing anything.
package pocketplanet

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

// ---------------------------------------------------------------- random

/** mulberry32, as in planet.js. */
class Rng(private var a: Int) {
    fun next(): Double {
        a += 0x6D2B79F5
        var t = (a xor (a ushr 15)) * (1 or a)
        t = (t + (t xor (t ushr 7)) * (61 or t)) xor t
        return ((t xor (t ushr 14)).toLong() and 0xffffffffL).toDouble() / 4294967296.0
    }
}

private fun hash2(x: Int, y: Int, s: Int): Double {
    var h = x * 374761393 + y * 668265263 + s * 982451653
    h = (h xor (h ushr 13)) * 1274126177
    h = h xor (h ushr 16)
    return (h.toLong() and 0xffffffffL).toDouble() / 4294967296.0
}

/** JavaScript's Math.round (half rounds toward +infinity). */
private fun jsRound(v: Double): Long = Math.round(v)

/** Math.hypot exactly as V8 computes it, so results match the JavaScript bit for bit. */
private fun hypot2(a: Double, b: Double): Double {
    val m = max(abs(a), abs(b))
    if (m == 0.0) return 0.0
    var sum = 0.0
    var comp = 0.0
    for (x in doubleArrayOf(a, b)) {
        val n = abs(x) / m
        val summand = n * n - comp
        val pre = sum + summand
        comp = (pre - sum) - summand
        sum = pre
    }
    return sqrt(sum) * m
}

private fun hypot3(a: Double, b: Double, c: Double): Double {
    val m = max(abs(a), max(abs(b), abs(c)))
    if (m == 0.0) return 0.0
    var sum = 0.0
    var comp = 0.0
    for (x in doubleArrayOf(a, b, c)) {
        val n = abs(x) / m
        val summand = n * n - comp
        val pre = sum + summand
        comp = (pre - sum) - summand
        sum = pre
    }
    return sqrt(sum) * m
}

// V8's sin/cos/atan2/asin/pow are fdlibm ports, like Java's StrictMath.
private fun sin(x: Double) = StrictMath.sin(x)
private fun cos(x: Double) = StrictMath.cos(x)
private fun atan2(y: Double, x: Double) = StrictMath.atan2(y, x)
private fun asin(x: Double) = StrictMath.asin(x)
private fun pow(x: Double, y: Double) = StrictMath.pow(x, y)
private fun ifloor(x: Double): Int = floor(x).toInt()

class Noise(rand: Rng) {
    private val p = IntArray(512)

    init {
        val perm = IntArray(256) { it }
        for (i in 255 downTo 1) {
            val j = ifloor(rand.next() * (i + 1))
            val t = perm[i]; perm[i] = perm[j]; perm[j] = t
        }
        for (i in 0 until 512) p[i] = perm[i and 255]
    }

    private fun grad(hash: Int, x: Double, y: Double, z: Double): Double {
        val h = hash and 15
        val u = if (h < 8) x else y
        val v = if (h < 4) y else if (h == 12 || h == 14) x else z
        return (if (h and 1 != 0) -u else u) + (if (h and 2 != 0) -v else v)
    }

    fun noise(x0: Double, y0: Double, z0: Double): Double {
        val fx = floor(x0); val fy = floor(y0); val fz = floor(z0)
        val x = x0 - fx; val y = y0 - fy; val z = z0 - fz
        val X = fx.toInt() and 255; val Y = fy.toInt() and 255; val Z = fz.toInt() and 255
        val u = x * x * x * (x * (x * 6 - 15) + 10)
        val v = y * y * y * (y * (y * 6 - 15) + 10)
        val w = z * z * z * (z * (z * 6 - 15) + 10)
        val A = p[X] + Y; val AA = p[A] + Z; val AB = p[A + 1] + Z
        val B = p[X + 1] + Y; val BA = p[B] + Z; val BB = p[B + 1] + Z
        val a1 = grad(p[AA], x, y, z); val b1 = grad(p[BA], x - 1, y, z)
        val a2 = grad(p[AB], x, y - 1, z); val b2 = grad(p[BB], x - 1, y - 1, z)
        val a3 = grad(p[AA + 1], x, y, z - 1); val b3 = grad(p[BA + 1], x - 1, y, z - 1)
        val a4 = grad(p[AB + 1], x, y - 1, z - 1); val b4 = grad(p[BB + 1], x - 1, y - 1, z - 1)
        val l1 = a1 + u * (b1 - a1); val l2 = a2 + u * (b2 - a2)
        val l3 = a3 + u * (b3 - a3); val l4 = a4 + u * (b4 - a4)
        val m1 = l1 + v * (l2 - l1); val m2 = l3 + v * (l4 - l3)
        return m1 + w * (m2 - m1)
    }

    fun fbm(x: Double, y: Double, z: Double, oct: Int): Double {
        var s = 0.0; var a = 0.5; var f = 1.0; var n = 0.0
        for (i in 0 until oct) { s += a * noise(x * f, y * f, z * f); n += a; a *= 0.5; f *= 2.03 }
        return s / n
    }
}

// ---------------------------------------------------------------- color

private fun c255(v: Double): Int { val r = jsRound(v); return if (r < 0) 0 else if (r > 255) 255 else r.toInt() }
private fun rgb(r: Double, g: Double, b: Double) = (c255(r) shl 16) or (c255(g) shl 8) or c255(b)
fun mix(a: Int, b: Int, t: Double) = rgb(
    ((a shr 16) and 255) * (1 - t) + ((b shr 16) and 255) * t,
    ((a shr 8) and 255) * (1 - t) + ((b shr 8) and 255) * t,
    (a and 255) * (1 - t) + (b and 255) * t,
)

fun hsl(h0: Double, s0: Double, l0: Double): Int {
    val h = ((h0 % 360) + 360) % 360 / 360
    val s = if (s0 < 0) 0.0 else if (s0 > 1) 1.0 else s0
    val l = if (l0 < 0) 0.0 else if (l0 > 1) 1.0 else l0
    if (s == 0.0) return rgb(l * 255, l * 255, l * 255)
    val q = if (l < 0.5) l * (1 + s) else l + s - l * s
    val p = 2 * l - q
    fun f(t0: Double): Double {
        var t = t0
        if (t < 0) t += 1.0
        if (t > 1) t -= 1.0
        if (t < 1.0 / 6) return p + (q - p) * 6 * t
        if (t < 1.0 / 2) return q
        if (t < 2.0 / 3) return p + (q - p) * (2.0 / 3 - t) * 6
        return p
    }
    return rgb(f(h + 1.0 / 3) * 255, f(h) * 255, f(h - 1.0 / 3) * 255)
}

private fun toHsl(c: Int): DoubleArray {
    val r = ((c shr 16) and 255) / 255.0; val g = ((c shr 8) and 255) / 255.0; val b = (c and 255) / 255.0
    val mx = max(r, max(g, b)); val mn = min(r, min(g, b))
    val l = (mx + mn) / 2; val d = mx - mn
    var h = 0.0; var s = 0.0
    if (d > 0) {
        s = if (l > 0.5) d / (2 - mx - mn) else d / (mx + mn)
        h = if (mx == r) (g - b) / d + (if (g < b) 6 else 0) else if (mx == g) (b - r) / d + 2 else (r - g) / d + 4
        h *= 60
    }
    return doubleArrayOf(h, s, l)
}

/** Like hsl(), but dark yellows turn olive/brown, so lift them toward gold. */
private fun vivid(h: Double, s: Double, l: Double): Int {
    val hh = ((h % 360) + 360) % 360
    val y = if (hh > 35 && hh < 70) 1 - abs(hh - 52) / 18 else 0.0
    return hsl(h, min(1.0, s + 0.25 * y), l + (0.85 - l) * 0.45 * y)
}

private fun hue(c: Int, deg: Double): Int { val x = toHsl(c); return hsl(x[0] + deg, x[1], x[2]) }

private val LEVELS = doubleArrayOf(0.2, 0.43, 0.68, 0.9, 1.0)

/** Banded "pixel art" shading: 5 light levels, the darkest tinted toward night. */
private class Shader(private val night: Int) {
    private val cache = HashMap<Int, Int>()
    fun shade(c: Int, lv: Int): Int {
        val key = c * 8 + lv
        cache[key]?.let { return it }
        var r = ((c shr 16) and 255).toDouble(); var g = ((c shr 8) and 255).toDouble(); var b = (c and 255).toDouble()
        val f = LEVELS[lv]
        if (lv == 4) { r += (255 - r) * 0.14; g += (255 - g) * 0.14; b += (255 - b) * 0.14 } else { r *= f; g *= f; b *= f }
        var v = rgb(r, g, b)
        if (lv == 0) v = mix(v, night, 0.4) else if (lv == 1) v = mix(v, night, 0.18)
        cache[key] = v
        return v
    }
}

private val BAYER = intArrayOf(0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5)
private fun bayer(x: Int, y: Int) = (BAYER[(y and 3) * 4 + (x and 3)] + 0.5) / 16
private fun levelFor(l: Double, b: Double): Int {
    val lv = ifloor((l + 0.22) / 1.22 * 4.6 + (b - 0.5) * 0.9)
    return if (lv < 0) 0 else if (lv > 4) 4 else lv
}

private fun quantile(arr: FloatArray, n: Int, f: Double): Double {
    if (n == 0) return 0.0
    val s = arr.copyOf(n); s.sort()
    val i = ifloor(f * (n - 1))
    return s[if (i < 0) 0 else if (i >= n) n - 1 else i].toDouble()
}

// ---------------------------------------------------------------- planets

class Ring(val ri: Double, val ro: Double, val cols: IntArray, val bins: IntArray)
class Moon(val ang: Double, val dist: Double, val size: Double, val color: Int, val seed: Int)
class Storm(val lon: Double, val lat: Double, val w: Double, val h: Double)

class Planet(val seed: Long, val type: String, val label: String) {
    var noiseSeed = 0L
    var tilt = 0.0; var elev = 0.0; var spin = 0.0; var scale = 0.0
    var light = DoubleArray(3)
    var bgHue = 0.0; var night = 0; var atm = 0
    var kind = ""
    val pal = HashMap<String, Int>()
    var gasPal = IntArray(0); var bands = IntArray(0)
    var land = 0.0; var clouds = 0.0; var ice = 0.0; var lavaFrac = 0.0
    var cities = false; var caps = false
    var freq = 0.0; var turb = 0.0; var storm: Storm? = null
    val craters = ArrayList<DoubleArray>()
    var axis = DoubleArray(3)
    var ring: Ring? = null
    val moons = ArrayList<Moon>()
    var name = ""; var temp = 0L; var day = 0L
    val facts = ArrayList<String>()
    fun c(key: String): Int = pal.getValue(key)
}

class Layout(val cx: Double, val cy: Double, val r: Double, val ey: Double = 1.12)
class Image(val w: Int, val h: Int, val pix: IntArray)

object PocketPlanet {
    private val TYPES = listOf("terran" to 5, "ocean" to 3, "desert" to 5, "moon" to 3, "ice" to 6, "lava" to 9,
        "gas" to 18, "candy" to 12, "toxic" to 6, "alien" to 20, "crystal" to 13)
    private val LABELS = mapOf("terran" to "Terran world", "ocean" to "Ocean world", "desert" to "Desert world",
        "ice" to "Ice world", "lava" to "Lava world", "gas" to "Gas giant", "moon" to "Barren rock",
        "candy" to "Candy world", "toxic" to "Toxic world", "alien" to "Alien world", "crystal" to "Crystal world")
    private val TEMPS = mapOf("terran" to (-10.0 to 35.0), "ocean" to (5.0 to 30.0), "desert" to (40.0 to 90.0),
        "ice" to (-190.0 to -40.0), "lava" to (400.0 to 1100.0), "gas" to (-170.0 to -90.0), "moon" to (-120.0 to 110.0),
        "candy" to (15.0 to 28.0), "toxic" to (30.0 to 75.0), "alien" to (-20.0 to 60.0), "crystal" to (-120.0 to 10.0))
    private val SYL = listOf("ka", "zu", "mi", "lo", "ra", "ve", "no", "xi", "ta", "qu", "el", "or", "an", "is", "um", "py",
        "sa", "do", "ri", "ne", "ko", "lu", "fa", "be", "yo", "ze", "th", "ar", "ix", "ul", "mo", "vi")
    private val SUFFIX = listOf("", "", "", " Prime", " II", " III", " IV", " VII", " b", " c", " Minor", " Major", "-9", "-42")

    /** seed: 0 .. 4294967295 */
    fun makePlanet(seedIn: Long): Planet {
        val seed = seedIn and 0xffffffffL
        val rng = Rng(seed.toInt() xor 0x5bd1e995)
        repeat(4) { rng.next() }
        fun rand() = rng.next()
        fun rr(a: Double, b: Double) = a + (b - a) * rand()
        fun <T> pick(a: List<T>): T = a[ifloor(rand() * a.size)]
        fun anyHue() = if (rand() < 0.33) rr(42.0, 58.0) else rr(0.0, 360.0)

        val total = TYPES.sumOf { it.second }
        var roll = rand() * total
        var type = TYPES[0].first
        for ((t, w) in TYPES) { roll -= w; if (roll < 0) { type = t; break } }

        val P = Planet(seed, type, LABELS.getValue(type))
        P.noiseSeed = floor(rand() * 4294967296.0).toLong()
        P.tilt = rr(-0.55, 0.55)
        P.elev = (if (rand() < 0.5) -1 else 1) * rr(0.2, 0.45)
        P.spin = rr(0.0, Math.PI * 2)
        P.scale = rr(1.5, 2.4)
        val L0 = rr(0.55, 0.9) * (if (rand() < 0.75) -1 else 1)
        val L1 = rr(0.15, 0.55)
        val L2 = rr(0.12, 0.45)
        val ll = hypot3(L0, L1, L2)
        P.light = doubleArrayOf(L0 / ll, L1 / ll, L2 / ll)
        P.bgHue = if (rand() < 0.6) rr(205.0, 250.0) else {
            val opts = listOf(rr(170.0, 205.0), rr(250.0, 300.0), rr(300.0, 360.0), rr(0.0, 30.0))
            pick(opts)
        }
        P.night = hsl(P.bgHue, 0.5, 0.12)
        P.atm = 0

        val pal = P.pal
        when (type) {
            "terran", "ocean" -> {
                val ws = rr(-15.0, 18.0); val hs = rr(-22.0, 18.0)
                pal["deep"] = hue(0x1d4b8f, ws); pal["shallow"] = hue(0x2f86c8, ws); pal["sand"] = 0xe6d394
                pal["grass"] = hue(0x5cab4b, hs); pal["forest"] = hue(0x387a3a, hs); pal["rock"] = 0x86765f
                pal["snow"] = 0xf1f5fa; pal["cloud"] = 0xffffff; pal["city"] = 0xffd27a
                P.kind = "wet"
                P.land = if (type == "ocean") rr(0.05, 0.12) else rr(0.3, 0.5)
                P.clouds = if (type == "ocean") rr(0.22, 0.35) else rr(0.15, 0.32)
                P.ice = if (type == "ocean") rr(0.85, 0.95) else rr(0.74, 0.9)
                P.cities = type == "terran" && rand() < 0.6
                P.atm = hue(0x7fc4ff, ws)
            }
            "candy" -> {
                val cs = pick(listOf(0.0, 90.0, 90.0, 120.0, 180.0, 240.0, 300.0)) + rr(-15.0, 15.0)
                pal["deep"] = hue(0xe46fa5, cs); pal["shallow"] = hue(0xff9fca, cs); pal["sand"] = 0xfff0b8
                pal["grass"] = hue(0x9eeac0, -cs); pal["forest"] = hue(0x6fcfa2, -cs); pal["rock"] = hue(0xc6a3e8, cs)
                pal["snow"] = 0xffffff; pal["cloud"] = 0xfff4fa
                P.kind = "wet"; P.land = rr(0.3, 0.5); P.clouds = rr(0.12, 0.3); P.ice = rr(0.8, 0.92)
                P.atm = hue(0xffb8de, cs)
            }
            "toxic" -> {
                val ts = pick(listOf(0.0, 0.0, 120.0, 200.0, 260.0)) + rr(-20.0, 20.0)
                pal["deep"] = hue(0x3b1a63, ts); pal["shallow"] = hue(0x6a2fa0, ts); pal["sand"] = hue(0xc6e85a, ts)
                pal["grass"] = hue(0x8fd436, ts); pal["forest"] = hue(0x4f9a2a, ts); pal["rock"] = 0x4a3b5c
                pal["snow"] = 0xe6ffb0; pal["cloud"] = hue(0xc9ff8a, ts)
                P.kind = "wet"; P.land = rr(0.35, 0.55); P.clouds = rr(0.15, 0.35); P.ice = rr(0.88, 0.97)
                P.atm = hue(0xb8ff6a, ts)
            }
            "alien" -> {
                val hw = anyHue()
                val hl = if (rand() < 0.3) rr(45.0, 58.0) else hw + rr(90.0, 180.0) * (if (rand() < 0.5) -1 else 1)
                pal["deep"] = vivid(hw, 0.6, 0.28); pal["shallow"] = vivid(hw, 0.65, 0.46); pal["sand"] = vivid(hl + 25, 0.65, 0.76)
                pal["grass"] = vivid(hl, 0.62, 0.56); pal["forest"] = vivid(hl - 12, 0.55, 0.38); pal["rock"] = vivid(hw + 40, 0.3, 0.42)
                pal["snow"] = vivid(hw, 0.45, 0.93); pal["cloud"] = vivid(hw + 20, 0.55, 0.9)
                P.kind = "wet"; P.land = rr(0.3, 0.55); P.clouds = rr(0.1, 0.28); P.ice = rr(0.82, 0.95)
                P.atm = vivid(hw, 0.85, 0.74)
            }
            "crystal" -> {
                val ch = anyHue()
                pal["c1"] = vivid(ch, 0.75, 0.88); pal["c2"] = vivid(ch, 0.65, 0.72); pal["c3"] = vivid(ch + 15, 0.6, 0.57)
                pal["c4"] = vivid(ch + 28, 0.55, 0.4); pal["crack"] = vivid(ch - 45 + (if (rand() < 0.5) 0 else 90), 0.95, 0.72)
                P.kind = "ice"; P.atm = vivid(ch, 0.9, 0.78)
            }
            "desert" -> {
                val dh = if (rand() < 0.35) pick(listOf(0.0, 90.0, 160.0, 200.0, 320.0)) + rr(-10.0, 10.0) else rr(15.0, 42.0)
                pal["s1"] = hsl(dh + 4, 0.6, 0.8); pal["s2"] = hsl(dh, 0.55, 0.66); pal["s3"] = hsl(dh - 5, 0.5, 0.52)
                pal["s4"] = hsl(dh - 10, 0.45, 0.38); pal["snow"] = 0xf6efe6; pal["cloud"] = hsl(dh, 0.5, 0.88)
                P.kind = "desert"; P.caps = rand() < 0.5; P.clouds = if (rand() < 0.5) rr(0.04, 0.12) else 0.0
                P.atm = hsl(dh, 0.75, 0.72)
            }
            "ice" -> {
                val ish = if (rand() < 0.5) rr(-180.0, 180.0) else rr(-20.0, 25.0)
                pal["c1"] = 0xf4fbff; pal["c2"] = hue(0xd2ecfa, ish); pal["c3"] = hue(0xa6d2ee, ish)
                pal["c4"] = hue(0x6aa7d6, ish); pal["crack"] = hue(0x3c6fa8, ish)
                P.kind = "ice"; P.atm = hue(0xcff0ff, ish)
            }
            "lava" -> {
                val lshift = if (rand() < 0.55) pick(listOf(60.0, 110.0, 150.0, 180.0, 210.0, 250.0, 290.0)) else rr(-10.0, 10.0)
                pal["r1"] = 0x4a3633; pal["r2"] = 0x362726; pal["r3"] = 0x241a1b
                pal["lava"] = hue(0xff5a1f, lshift); pal["hot"] = hue(0xffc93c, lshift)
                P.kind = "lava"; P.lavaFrac = rr(0.12, 0.22)
            }
            "gas" -> {
                val h1 = anyHue()
                val h2 = h1 + rr(20.0, 70.0) * (if (rand() < 0.5) -1 else 1)
                val sat = rr(0.45, 0.75)
                val gp = intArrayOf(hsl(h1, sat, 0.84), hsl(h1, sat, 0.7), hsl(h2, sat, 0.6), hsl(h2, sat * 0.9, 0.47), hsl(h1, sat, 0.56))
                val n = 7 + ifloor(rand() * 6)
                val bands = IntArray(n)
                var prev = -1
                for (i in 0 until n) {
                    var b: Int
                    do { b = ifloor(rand() * gp.size) } while (b == prev)
                    bands[i] = b; prev = b
                }
                P.gasPal = gp
                pal["storm"] = hsl(h2 + 180 * (if (rand() < 0.3) 1 else 0) + 10, 0.6, 0.6)
                pal["stormIn"] = hsl(h2 + 15, 0.55, 0.78)
                P.kind = "gas"; P.bands = bands; P.freq = rr(2.5, 6.0); P.turb = rr(0.15, 0.4)
                if (rand() < 0.65) {
                    val lon = rr(-1.0, 1.0); val lat = rr(-0.5, 0.5); val w = rr(0.25, 0.45); val h = rr(0.1, 0.18)
                    P.storm = Storm(lon, lat, w, h)
                }
                P.atm = hsl(h1, 0.6, 0.8)
            }
            else -> {
                val mh = rr(0.0, 360.0); val ms = rr(0.03, 0.16)
                pal["c1"] = hsl(mh, ms, 0.72); pal["c2"] = hsl(mh, ms, 0.6); pal["c3"] = hsl(mh, ms, 0.48)
                pal["floor"] = hsl(mh, ms, 0.38); pal["rim"] = hsl(mh, ms, 0.82)
                P.kind = "moon"
                val nc = 14 + ifloor(rand() * 14)
                for (i in 0 until nc) {
                    val cu = rr(-1.0, 1.0); val ca = rr(0.0, Math.PI * 2); val cr = sqrt(1 - cu * cu); val rad = rr(0.07, 0.24)
                    P.craters.add(doubleArrayOf(cr * cos(ca), cu, cr * sin(ca), cos(rad), cos(rad * 0.75)))
                }
            }
        }

        // rings lie in the equator plane; the ring normal is the planet's axis
        val ringChance = if (type == "gas") 0.5 else if (type == "moon") 0.05 else 0.15
        P.axis = doubleArrayOf(-sin(P.tilt) * cos(P.elev), cos(P.tilt) * cos(P.elev), sin(P.elev))
        if (rand() < ringChance) {
            val base = if (type == "gas") P.gasPal[0] else if (type == "moon") pal.getValue("c1") else hsl(rr(0.0, 360.0), 0.35, 0.75)
            val cols = intArrayOf(base, hue(mix(base, 0xffffff, 0.25), 20.0), mix(base, 0x000000, 0.25))
            val nb = 48
            val bins = IntArray(nb)
            var cur = 0
            for (i in 0 until nb) {
                if (rand() < 0.35) cur = ifloor(rand() * 3)
                bins[i] = if (rand() < 0.1) -1 else cur
            }
            val ri = rr(1.25, 1.5); val ro = rr(1.8, 2.25)
            P.ring = Ring(ri, ro, cols, bins)
        }

        val mr = rand()
        val nm = if (mr < 0.45) 0 else if (mr < 0.8) 1 else 2
        for (i in 0 until nm) {
            val ang = rr(0.0, Math.PI * 2); val dist = rr(1.45, 1.9); val size = rr(0.09, 0.16)
            val ch = rr(0.0, 360.0); val cs = rr(0.0, 0.25); val cl = rr(0.55, 0.75)
            val ms = floor(rand() * 1e9).toInt()
            P.moons.add(Moon(ang, dist, size, hsl(ch, cs, cl), ms))
        }

        var name = ""
        val ns = 2 + (if (rand() < 0.35) 1 else 0)
        for (i in 0 until ns) name += pick(SYL)
        if (name.startsWith("th") || name.startsWith("x") || name.length < 4) name = pick(listOf("a", "o", "e")) + name
        P.name = name.substring(0, 1).uppercase() + name.substring(1) + pick(SUFFIX)
        val tr = TEMPS.getValue(type)
        P.temp = jsRound(rr(tr.first, tr.second))
        P.day = jsRound(rr(5.0, 80.0))
        P.facts.add("${P.day} h day")
        P.facts.add((if (P.temp > 0) "+" else "") + P.temp + "°C")
        P.facts.add(if (nm == 0) "no moons" else if (nm == 1) "1 moon" else "$nm moons")
        if (P.ring != null) P.facts.add("rings")
        return P
    }

    /** Fit the planet (and its rings and halo) into a box of grid pixels. */
    fun layout(P: Planet, x: Double, y: Double, w: Double, h: Double, fill: Double = 0.94): Layout {
        val a = P.axis
        var ex = 1.12; var ey = 1.12
        P.ring?.let {
            ex = max(ex, it.ro * sqrt(1 - a[0] * a[0]))
            ey = max(ey, it.ro * sqrt(1 - a[1] * a[1]))
        }
        val r = min(w / 2 / ex, h / 2 / ey) * fill
        return Layout(x + w / 2, y + h / 2, r, ey)
    }

    // ---------------------------------------------------------------- render

    fun render(P: Planet, W: Int, H: Int, lay: Layout, glow: Boolean = false): Image {
        val pix = IntArray(W * H)
        val N = Noise(Rng(P.noiseSeed.toInt()))
        val shader = Shader(P.night)
        val rng = Rng(P.seed.toInt() xor 0x2545f491)
        val lx = P.light[0]; val ly = P.light[1]; val lz = P.light[2]

        // --- sky
        val bg0 = hsl(P.bgHue, 0.45, 0.065); val bg1 = hsl(P.bgHue, 0.4, 0.09); val bg2 = hsl(P.bgHue + 30, 0.35, 0.115)
        val nf = 6.0 / max(W, H)
        for (py in 0 until H) for (px in 0 until W) {
            val nv = N.fbm(px * nf, py * nf, 11.3, 2) * 3 + (bayer(px, py) - 0.5) * 0.45
            pix[py * W + px] = if (nv > 0.95) bg2 else if (nv > 0.5) bg1 else bg0
        }
        val stars = intArrayOf(0xffffff, 0xfff1c9, 0xcfe0ff)
        val starMix = doubleArrayOf(0.35, 0.6, 1.0)
        val ns = jsRound(W * H * 0.012).toInt()
        for (i in 0 until ns) {
            val px = ifloor(rng.next() * W); val py = ifloor(rng.next() * H)
            pix[py * W + px] = mix(bg0, stars[i % 3], starMix[ifloor(rng.next() * 3)])
        }
        val nbig = max(2L, jsRound(W * H * 0.0007)).toInt()
        for (i in 0 until nbig) {
            val px = 2 + ifloor(rng.next() * (W - 4)); val py = 2 + ifloor(rng.next() * (H - 4))
            val sc = stars[i % 3]; val arm = mix(bg0, sc, 0.45)
            pix[py * W + px] = sc
            pix[py * W + px - 1] = arm; pix[py * W + px + 1] = arm
            pix[(py - 1) * W + px] = arm; pix[(py + 1) * W + px] = arm
        }

        val cx = lay.cx; val cy = lay.cy; val R = lay.r
        val ring = P.ring; val an = P.axis
        val ri = ring?.ri ?: 0.0; val ro = ring?.ro ?: 0.0; val nb = ring?.bins?.size ?: 0
        val aw = if (P.atm != 0) max(1.5, R * 0.07) / R else 0.0
        var ext = max(1 + aw, ro) + 2 / R
        // glow: backlit look, a bright halo around the lit edge plus a sun flare
        // just behind it, in dithered steps so it stays pixel art.
        val GL = 0.3; val FR = 0.6
        val GLV = doubleArrayOf(0.0, 0.16, 0.34, 0.58, 0.85)
        val lxyRaw = hypot2(lx, ly)
        val lxy = if (lxyRaw == 0.0) 1.0 else lxyRaw
        val ux = lx / lxy; val uy = ly / lxy
        val glowCol = mix(if (P.atm != 0) P.atm else 0xffd9a8, 0xffffff, 0.45)
        if (glow) ext = max(ext, max(1 + GL, 1 + FR)) + 2 / R
        val x0 = max(0, ifloor(cx - ext * R)); val x1 = min(W - 1, ceil(cx + ext * R).toInt())
        val y0 = max(0, ifloor(cy - ext * R)); val y1 = min(H - 1, ceil(cy + ext * R).toInt())

        // planet orientation: view -> planet frame = Ry(-spin) Rx(-elev) Rz(-tilt)
        val ct = cos(P.tilt); val st = sin(P.tilt); val ce = cos(P.elev); val se = sin(P.elev)
        val cs = cos(P.spin); val ss = sin(P.spin)

        val cap = max(0, (x1 - x0 + 1)) * max(0, (y1 - y0 + 1))
        val sIdx = IntArray(cap); val sX = FloatArray(cap); val sY = FloatArray(cap); val sZ = FloatArray(cap)
        val U = FloatArray(cap); val V = FloatArray(cap); val Wv = FloatArray(cap)
        var n = 0

        for (py in y0..y1) for (px in x0..x1) {
            val x = (px + 0.5 - cx) / R; val y = -(py + 0.5 - cy) / R
            val d2 = x * x + y * y
            val z = if (d2 < 1) sqrt(1 - d2) else -9.0
            var rb = -1; var rt = 0.0; var rr2 = 0.0
            if (ring != null) {
                rt = -(x * an[0] + y * an[1]) / an[2]
                rr2 = d2 + rt * rt
                if (rr2 >= ri * ri && rr2 <= ro * ro) rb = ring.bins[min(nb - 1, ifloor((sqrt(rr2) - ri) / (ro - ri) * nb))]
            }
            val k = py * W + px
            if (d2 < 1 && !(rb >= 0 && rt > z)) {
                sIdx[n] = k; sX[n] = x.toFloat(); sY[n] = y.toFloat(); sZ[n] = z.toFloat()
                val x1r = x * ct + y * st; val y1r = -x * st + y * ct
                val y2 = y1r * ce + z * se; val z2 = -y1r * se + z * ce
                U[n] = (x1r * cs - z2 * ss).toFloat(); V[n] = y2.toFloat(); Wv[n] = (x1r * ss + z2 * cs).toFloat()
                n++
                continue
            }
            if (rb >= 0) {
                val bd = x * lx + y * ly + rt * lz
                val shadow = bd < 0 && bd * bd > rr2 - 1
                val rlv = if (shadow) 1 else if (bayer(px, py) > 0.85) 4 else 3
                pix[k] = shader.shade(ring!!.cols[rb], rlv)
                continue
            }
            if (aw != 0.0 && d2 < (1 + aw) * (1 + aw)) {
                val d = sqrt(d2)
                val lit = (x * lx + y * ly) / d + (bayer(px, py) - 0.5) * 0.3
                if (lit > -0.15) {
                    val inner = d < 1 + aw * 0.5
                    val alpha = (if (inner) 0.55 else 0.28) * (if (lit > 0.35) 1.0 else 0.6)
                    pix[k] = mix(pix[k], P.atm, alpha)
                }
            }
            if (glow) {
                val gd = sqrt(d2)
                val face = max(0.0, (x * ux + y * uy) / gd)
                val halo = if (gd < 1 + GL) face * face * face * pow(1 - (gd - 1) / GL, 2.0) else 0.0
                val fq = hypot2(x - ux, y - uy) / FR
                val flare = if (fq < 1) pow(1 - fq, 2.2) * 1.2 else 0.0
                val glv = ifloor(min(1.0, halo + flare) * 5 + (bayer(px, py) - 0.5) * 0.9)
                if (glv > 0) pix[k] = mix(pix[k], glowCol, GLV[if (glv > 4) 4 else glv])
            }
        }

        colorSurface(P, N, shader, pix, n, sIdx, sX, sY, sZ, U, V, Wv, W)
        if (glow) {
            // light spilling over the lit edge of the disk
            for (i in 0 until n) {
                val f = sX[i] * ux + sY[i] * uy
                if (f <= 0) continue
                val e = 1 - sZ[i].toDouble()
                val rim = f * f * e * e * e * e * 1.4
                val k2 = sIdx[i]; val qx = k2 % W
                val rlv2 = ifloor(min(1.0, rim) * 5 + (bayer(qx, (k2 - qx) / W) - 0.5) * 0.9)
                if (rlv2 > 0) pix[k2] = mix(pix[k2], glowCol, GLV[if (rlv2 > 4) 4 else rlv2] * 0.85)
            }
        }
        drawMoons(P, pix, W, H, cx, cy, R, shader)
        return Image(W, H, pix)
    }

    private fun colorSurface(
        P: Planet, N: Noise, shader: Shader, pix: IntArray, n: Int, sIdx: IntArray,
        sX: FloatArray, sY: FloatArray, sZ: FloatArray, U: FloatArray, V: FloatArray, Wv: FloatArray, W: Int,
    ) {
        val s = P.scale; val kind = P.kind
        val lx = P.light[0]; val ly = P.light[1]; val lz = P.light[2]
        val F1 = FloatArray(n); val F2 = FloatArray(n); val F3 = FloatArray(n)

        for (i in 0 until n) {
            val u = U[i] * s; val v = V[i] * s; val w = Wv[i] * s
            when (kind) {
                "wet" -> {
                    F1[i] = N.fbm(u, v, w, 5).toFloat()
                    F2[i] = N.fbm(u * 0.9 + 17.1, v * 2.4 + 3.3, w * 0.9 - 5.2, 4).toFloat()
                    F3[i] = (N.noise(u * 2.5 + 40, v * 2.5, w * 2.5) * 0.12).toFloat()
                }
                "desert" -> {
                    F1[i] = (N.fbm(u, v, w, 4) * 0.75 + N.noise(u * 1.5, v * 9, w * 1.5) * 0.25).toFloat()
                    F2[i] = if (P.clouds != 0.0) N.fbm(u * 0.8 + 9, v * 3, w * 0.8, 3).toFloat() else 0f
                    F3[i] = (N.noise(u * 2.5 + 40, v * 2.5, w * 2.5) * 0.08).toFloat()
                }
                "ice" -> {
                    F1[i] = N.fbm(u, v, w, 4).toFloat()
                    F2[i] = (1 - abs(N.fbm(u * 1.4 + 31, v * 1.4, w * 1.4, 3))).toFloat()
                }
                "lava" -> {
                    F1[i] = N.fbm(u, v, w, 4).toFloat()
                    F2[i] = (1 - abs(N.fbm(u * 1.2 + 5, v * 1.2, w * 1.2, 4))).toFloat()
                }
                "gas" -> F1[i] = N.fbm(u * 1.2, v * 4, w * 1.2, 3).toFloat()
                else -> F1[i] = N.fbm(u * 1.3, v * 1.3, w * 1.3, 4).toFloat()
            }
        }

        var tSea = 0.0; var tShallow = 0.0; var tTop = 0.0; var tCloud = 0.0
        var tA = 0.0; var tB = 0.0; var tC = 0.0; var tCrack = 0.0; var tLava = 0.0; var tHot = 0.0
        when (kind) {
            "wet" -> {
                tSea = quantile(F1, n, 1 - P.land)
                tShallow = quantile(F1, n, max(0.0, 1 - P.land - 0.07))
                tTop = quantile(F1, n, 0.995)
                tCloud = quantile(F2, n, 1 - P.clouds)
            }
            "desert" -> {
                tA = quantile(F1, n, 0.25); tB = quantile(F1, n, 0.55); tC = quantile(F1, n, 0.85)
                tCloud = if (P.clouds != 0.0) quantile(F2, n, 1 - P.clouds) else 9.0
            }
            "ice" -> {
                tA = quantile(F1, n, 0.12); tB = quantile(F1, n, 0.4); tC = quantile(F1, n, 0.72)
                tCrack = quantile(F2, n, 0.9)
            }
            "lava" -> {
                tA = quantile(F1, n, 0.33); tB = quantile(F1, n, 0.66)
                tLava = quantile(F2, n, 1 - P.lavaFrac); tHot = quantile(F2, n, 1 - P.lavaFrac * 0.35)
            }
            "moon" -> { tA = quantile(F1, n, 0.33); tB = quantile(F1, n, 0.7) }
        }

        val ring = P.ring; val an = P.axis
        val la = if (ring != null) lx * an[0] + ly * an[1] + lz * an[2] else 0.0
        val seedInt = P.seed.toInt()

        for (i in 0 until n) {
            val k = sIdx[i]; val px = k % W; val py = (k - px) / W; val b = bayer(px, py)
            val x = sX[i].toDouble(); val y = sY[i].toDouble(); val z = sZ[i].toDouble()
            val l = x * lx + y * ly + z * lz
            var lv = levelFor(l, b)
            if (ring != null && abs(la) > 1e-3) {
                val sd = -(x * an[0] + y * an[1] + z * an[2]) / la
                if (sd > 0) {
                    val qx = x + sd * lx; val qy = y + sd * ly; val qz = z + sd * lz
                    val qd = sqrt(qx * qx + qy * qy + qz * qz)
                    if (qd > ring.ri && qd < ring.ro &&
                        ring.bins[min(ring.bins.size - 1, ifloor((qd - ring.ri) / (ring.ro - ring.ri) * ring.bins.size))] >= 0)
                        lv = max(0, lv - 2)
                }
            }
            val f1 = F1[i].toDouble(); val f2 = F2[i].toDouble(); val lat = abs(V[i].toDouble())
            var c: Int
            var emit = -1

            when (kind) {
                "wet" -> {
                    val land = f1 > tSea
                    c = if (lat + F3[i] > P.ice) P.c("snow")
                    else if (!land) (if (f1 > tShallow) P.c("shallow") else P.c("deep"))
                    else {
                        val hh = (f1 - tSea) / max(1e-6, tTop - tSea)
                        if (hh < 0.07) P.c("sand") else if (hh < 0.45) P.c("grass") else if (hh < 0.75) P.c("forest")
                        else if (hh < 0.93) P.c("rock") else P.c("snow")
                    }
                    if (f2 > tCloud) c = P.c("cloud")
                    else if (P.cities && land && lv == 0 && c != P.c("snow") && hash2(px, py, seedInt) < 0.07) emit = P.c("city")
                }
                "desert" -> {
                    c = if (f1 > tC) P.c("s1") else if (f1 > tB) P.c("s2") else if (f1 > tA) P.c("s3") else P.c("s4")
                    if (P.caps && lat + F3[i] > 0.88) c = P.c("snow")
                    if (f2 > tCloud) c = P.c("cloud")
                }
                "ice" -> {
                    c = if (f1 > tC) P.c("c1") else if (f1 > tB) P.c("c2") else if (f1 > tA) P.c("c3") else P.c("c4")
                    if (f2 > tCrack) c = P.c("crack")
                }
                "lava" -> {
                    c = if (f1 > tB) P.c("r1") else if (f1 > tA) P.c("r2") else P.c("r3")
                    if (f2 > tHot) { c = P.c("hot"); lv = 4 } else if (f2 > tLava) { c = P.c("lava"); lv = max(lv, 3) }
                }
                "gas" -> {
                    val bnd = V[i] * P.freq + f1 * P.turb * P.freq + (b - 0.5) * 0.25
                    var bi = ifloor(bnd) % P.bands.size
                    if (bi < 0) bi += P.bands.size
                    c = P.gasPal[P.bands[bi]]
                    P.storm?.let { st ->
                        val lon = atan2(Wv[i].toDouble(), U[i].toDouble())
                        val latA = asin(max(-1.0, min(1.0, V[i].toDouble())))
                        var dl = lon - st.lon
                        dl -= jsRound(dl / (2 * Math.PI)) * 2 * Math.PI
                        val e = (dl / st.w) * (dl / st.w) + ((latA - st.lat) / st.h) * ((latA - st.lat) / st.h)
                        if (e < 0.4) c = P.c("stormIn") else if (e < 1) c = P.c("storm")
                    }
                }
                else -> {
                    c = if (f1 > tB) P.c("c1") else if (f1 > tA) P.c("c2") else P.c("c3")
                    for (cr in P.craters) {
                        val dd = U[i] * cr[0] + V[i] * cr[1] + Wv[i] * cr[2]
                        if (dd > cr[3]) { c = if (dd > cr[4]) P.c("floor") else P.c("rim"); break }
                    }
                }
            }
            pix[k] = if (emit >= 0) emit else shader.shade(c, lv)
        }
    }

    private fun drawMoons(P: Planet, pix: IntArray, W: Int, H: Int, cx: Double, cy: Double, R: Double, shader: Shader) {
        val lx = P.light[0]; val ly = P.light[1]; val lz = P.light[2]
        for (mo in P.moons) {
            val mr = max(2.0, mo.size * R)
            var placed = false; var mx = 0.0; var my = 0.0
            var tries = 0
            while (tries < 8 && !placed) {
                val ang = mo.ang + tries * 0.8
                val dist = (if (P.ring != null) max(mo.dist, P.ring!!.ro * 0.95) else mo.dist) * R + mr
                mx = cx + cos(ang) * dist; my = cy - sin(ang) * dist * 0.9
                placed = mx - mr > 1 && mx + mr < W - 1 && my - mr > 1 && my + mr < H - 1
                tries++
            }
            if (!placed) continue
            val mN = Noise(Rng(mo.seed))
            val dark = mix(mo.color, 0x000000, 0.22)
            for (py in ifloor(my - mr)..ceil(my + mr).toInt()) {
                for (px in ifloor(mx - mr)..ceil(mx + mr).toInt()) {
                    if (px < 0 || py < 0 || px >= W || py >= H) continue
                    val x = (px + 0.5 - mx) / mr; val y = -(py + 0.5 - my) / mr; val d2 = x * x + y * y
                    if (d2 >= 1) continue
                    val z = sqrt(1 - d2)
                    val c = if (mN.noise(x * 2.2, y * 2.2, z * 2.2) > 0.12) dark else mo.color
                    pix[py * W + px] = shader.shade(c, levelFor(x * lx + y * ly + z * lz, bayer(px, py)))
                }
            }
        }
    }

    // ---------------------------------------------------------------- wallpaper

    /** A rendered wallpaper: w x h grid pixels, each drawn as a px x px block. */
    class Frame(val w: Int, val h: Int, val px: Int, val pix: IntArray, val planet: Planet)

    /**
     * The close-up wallpaper used on Windows: a huge planet running off the
     * left and bottom edges, lit from behind, with its name in the free corner.
     * Works for any size: landscape (PCs, tablets) and portrait (phones).
     */
    fun wallpaper(seed: Long, widthPx: Int, heightPx: Int): Frame {
        val P = makePlanet(seed)
        val Wp = widthPx; val Hp = heightPx
        // One pixel-art pixel is PX screen pixels: 4 on a 1080p screen, 5 on 1440p, 8 on 4K.
        val PX = max(2L, jsRound(min(Wp, Hp) / 270.0)).toInt()
        val W = ceil(Wp.toDouble() / PX).toInt(); val H = ceil(Hp.toDouble() / PX).toInt()
        val wide = Wp >= Hp

        val r = (if (wide) 0.68 else 0.6) * min(H.toDouble(), W * 1.6)
        val lay = if (wide) Layout(W * 0.12, H * 0.7, r) else Layout(W * 0.05, H * 0.68, r)
        val ll = hypot3(0.6, 0.72, -0.12)
        P.light = doubleArrayOf(0.6 / ll, 0.72 / ll, -0.12 / ll)
        val img = render(P, W, H, lay, glow = true)

        // Name, type and facts in the free corner: bottom right, or top right
        // when the planet or its rings would cover the text there.
        val lines = listOf(Triple(P.name, 2, 0xffffff), Triple(P.label, 1, 0xd8d4f0), Triple(P.facts.joinToString(" · "), 1, 0xa9a6c6))
        val nameScale = if (textWidth(P.name, 2) > W * 0.4) 1 else 2
        val right = W - jsRound(W * 0.04).toInt()
        val blockW = lines.maxOf { textWidth(it.first, if (it === lines[0]) nameScale else it.second) }
        val blockH = 7 * nameScale + 7 * 2 + 12
        val bottom = jsRound(H * (if (wide) 0.76 else 0.82)).toInt(); val top = jsRound(H * 0.07).toInt()
        var ty = if (covered(P, lay, right - blockW, bottom, blockW, blockH) <= covered(P, lay, right - blockW, top, blockW, blockH)) bottom else top
        for ((i, line) in lines.withIndex()) {
            val sc = if (i == 0) nameScale else line.second
            drawText(img, line.first, right - textWidth(line.first, sc), ty, sc, line.third, 0x05050c)
            ty += 7 * sc + 4
        }
        return Frame(W, H, PX, img.pix, P)
    }

    /** How many pixels of the rectangle the planet's disk or rings cover. */
    private fun covered(P: Planet, lay: Layout, x0: Int, y0: Int, w: Int, h: Int): Int {
        val a = P.axis; val ring = P.ring
        var hits = 0
        for (py in y0 until y0 + h) for (px in x0 until x0 + w) {
            val x = (px + 0.5 - lay.cx) / lay.r; val y = -(py + 0.5 - lay.cy) / lay.r
            if (x * x + y * y < 1.21) { hits++; continue }
            if (ring != null) {
                val t = -(x * a[0] + y * a[1]) / a[2]; val d = sqrt(x * x + y * y + t * t)
                if (d >= ring.ri && d <= ring.ro) hits++
            }
        }
        return hits
    }

    // 5x7 pixel font: 7 rows per glyph, 5 bits per row (16 = leftmost pixel).
    private val FONT: Map<Char, IntArray> = mapOf(
        'A' to intArrayOf(14, 17, 17, 31, 17, 17, 17), 'B' to intArrayOf(30, 17, 17, 30, 17, 17, 30),
        'C' to intArrayOf(14, 17, 16, 16, 16, 17, 14), 'D' to intArrayOf(28, 18, 17, 17, 17, 18, 28),
        'E' to intArrayOf(31, 16, 16, 30, 16, 16, 31), 'F' to intArrayOf(31, 16, 16, 30, 16, 16, 16),
        'G' to intArrayOf(14, 17, 16, 23, 17, 17, 15), 'H' to intArrayOf(17, 17, 17, 31, 17, 17, 17),
        'I' to intArrayOf(14, 4, 4, 4, 4, 4, 14), 'J' to intArrayOf(7, 2, 2, 2, 2, 18, 12),
        'K' to intArrayOf(17, 18, 20, 24, 20, 18, 17), 'L' to intArrayOf(16, 16, 16, 16, 16, 16, 31),
        'M' to intArrayOf(17, 27, 21, 21, 17, 17, 17), 'N' to intArrayOf(17, 17, 25, 21, 19, 17, 17),
        'O' to intArrayOf(14, 17, 17, 17, 17, 17, 14), 'P' to intArrayOf(30, 17, 17, 30, 16, 16, 16),
        'Q' to intArrayOf(14, 17, 17, 17, 21, 18, 13), 'R' to intArrayOf(30, 17, 17, 30, 20, 18, 17),
        'S' to intArrayOf(15, 16, 16, 14, 1, 1, 30), 'T' to intArrayOf(31, 4, 4, 4, 4, 4, 4),
        'U' to intArrayOf(17, 17, 17, 17, 17, 17, 14), 'V' to intArrayOf(17, 17, 17, 17, 17, 10, 4),
        'W' to intArrayOf(17, 17, 17, 21, 21, 21, 10), 'X' to intArrayOf(17, 17, 10, 4, 10, 17, 17),
        'Y' to intArrayOf(17, 17, 10, 4, 4, 4, 4), 'Z' to intArrayOf(31, 1, 2, 4, 8, 16, 31),
        '0' to intArrayOf(14, 17, 19, 21, 25, 17, 14), '1' to intArrayOf(4, 12, 4, 4, 4, 4, 14),
        '2' to intArrayOf(14, 17, 1, 2, 4, 8, 31), '3' to intArrayOf(31, 2, 4, 2, 1, 17, 14),
        '4' to intArrayOf(2, 6, 10, 18, 31, 2, 2), '5' to intArrayOf(31, 16, 30, 1, 1, 17, 14),
        '6' to intArrayOf(6, 8, 16, 30, 17, 17, 14), '7' to intArrayOf(31, 1, 2, 4, 8, 8, 8),
        '8' to intArrayOf(14, 17, 17, 14, 17, 17, 14), '9' to intArrayOf(14, 17, 17, 15, 1, 2, 12),
        ' ' to intArrayOf(0, 0, 0, 0, 0, 0, 0), '-' to intArrayOf(0, 0, 0, 31, 0, 0, 0),
        '+' to intArrayOf(0, 4, 4, 31, 4, 4, 0), '°' to intArrayOf(12, 18, 18, 12, 0, 0, 0),
        '·' to intArrayOf(0, 0, 0, 4, 0, 0, 0), '.' to intArrayOf(0, 0, 0, 0, 0, 12, 12),
    )

    fun textWidth(text: String, s: Int) = text.length * 6 * s - s

    fun drawText(img: Image, text: String, x0: Int, y0: Int, s: Int, color: Int, shadow: Int) {
        for (pass in intArrayOf(shadow, color)) {
            val d = if (pass == shadow) s else 0
            var x = x0
            for (ch in text.uppercase()) {
                val g = FONT[ch] ?: FONT.getValue(' ')
                for (row in 0 until 7) for (col in 0 until 5) {
                    if (g[row] and (16 shr col) == 0) continue
                    for (dy in 0 until s) for (dx in 0 until s) {
                        val px = x + col * s + dx + d; val py = y0 + row * s + dy + d
                        if (px >= 0 && py >= 0 && px < img.w && py < img.h) img.pix[py * img.w + px] = pass
                    }
                }
                x += 6 * s
            }
        }
    }
}
