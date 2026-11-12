package app.pocketplanet

import android.app.WallpaperManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder
import pocketplanet.PocketPlanet
import kotlin.random.Random

/**
 * Live wallpaper: draws a new planet each time the screen turns off, so every
 * time you wake and unlock the phone there's a new one waiting. Double-tap an
 * empty spot on the home screen for a new planet right away.
 */
class PlanetWallpaperService : WallpaperService() {

    override fun onCreateEngine(): Engine = PlanetEngine()

    private inner class PlanetEngine : Engine() {
        private val thread = HandlerThread("pocket-planet").apply { start() }
        private val worker = Handler(thread.looper)
        private val paint = Paint().apply { isFilterBitmap = false; isAntiAlias = false; isDither = false }

        // Touched only on the worker thread.
        private var seed = newSeed()
        private var surfaceW = 0
        private var surfaceH = 0
        private var bitmap: Bitmap? = null
        private var blockPx = 1
        private var lastTap = 0L
        private var receiverOn = false

        private val screenOff = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                // Render while the screen is off so the new planet is ready when it wakes.
                if (intent.action == Intent.ACTION_SCREEN_OFF) worker.post { seed = newSeed(); renderAndDraw() }
            }
        }

        override fun onCreate(holder: SurfaceHolder) {
            super.onCreate(holder)
            if (!isPreview) {
                registerReceiver(screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF))
                receiverOn = true
            }
        }

        override fun onDestroy() {
            if (receiverOn) runCatching { unregisterReceiver(screenOff) }
            worker.removeCallbacksAndMessages(null)
            thread.quitSafely()
            super.onDestroy()
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            super.onSurfaceChanged(holder, format, width, height)
            // Same planet, redrawn for the new size (rotation, folding, resizing).
            worker.post { surfaceW = width; surfaceH = height; renderAndDraw() }
        }

        override fun onSurfaceRedrawNeeded(holder: SurfaceHolder) {
            super.onSurfaceRedrawNeeded(holder)
            worker.post { draw() }
        }

        override fun onVisibilityChanged(visible: Boolean) {
            if (visible) worker.post { draw() }
        }

        override fun onCommand(action: String?, x: Int, y: Int, z: Int, extras: Bundle?, resultRequested: Boolean): Bundle? {
            if (action == WallpaperManager.COMMAND_TAP) {
                val now = SystemClock.uptimeMillis()
                if (now - lastTap < 350) { lastTap = 0; worker.post { seed = newSeed(); renderAndDraw() } } else lastTap = now
            }
            return null
        }

        private fun renderAndDraw() {
            if (surfaceW <= 0 || surfaceH <= 0) return
            val frame = PocketPlanet.wallpaper(seed, surfaceW, surfaceH)
            val argb = IntArray(frame.pix.size) { frame.pix[it] or 0xFF000000.toInt() }
            val bmp = Bitmap.createBitmap(frame.w, frame.h, Bitmap.Config.ARGB_8888)
            bmp.setPixels(argb, 0, frame.w, 0, 0, frame.w, frame.h)
            bitmap?.recycle()
            bitmap = bmp
            blockPx = frame.px
            draw()
        }

        private fun draw() {
            val bmp = bitmap ?: return
            val holder = surfaceHolder
            var canvas: Canvas? = null
            try {
                canvas = holder.lockCanvas() ?: return
                canvas.drawColor(Color.BLACK)
                // Whole-number scaling without filtering keeps the pixel art sharp.
                canvas.drawBitmap(bmp, null, Rect(0, 0, bmp.width * blockPx, bmp.height * blockPx), paint)
            } finally {
                if (canvas != null) runCatching { holder.unlockCanvasAndPost(canvas) }
            }
        }
    }

    private fun newSeed(): Long = Random.nextLong(0, 4294967296L)
}
