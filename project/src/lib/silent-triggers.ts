import type { Profile } from './types';

export class SilentTriggers {
  private shakeCount = 0;
  private shakeTimer: number | null = null;
  private tapCount = 0;
  private tapTimer: number | null = null;
  private motionHandler: ((e: DeviceMotionEvent) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private logoTapHandler: (() => void) | null = null;
  private profile: Profile | null = null;

  init(profile: Profile) {
    this.profile = profile;

    // 1. Shake detection (3 shakes)
    if (profile.silent_shake) {
      this.motionHandler = (e: DeviceMotionEvent) => {
        const acc = e.accelerationIncludingGravity;
        if (!acc || acc.x === null) return;
        const magnitude = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
        if (magnitude > 25) {
          this.shakeCount++;
          if (this.shakeTimer) clearTimeout(this.shakeTimer);
          this.shakeTimer = window.setTimeout(() => { this.shakeCount = 0; }, 2000);
          if (this.shakeCount >= 3) {
            this.shakeCount = 0;
            this.trigger(true);
          }
        }
      };
      // iOS 13+ requires permission
      const DME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof DME.requestPermission === 'function') {
        DME.requestPermission().then((granted: string) => {
          if (granted === 'granted') {
            window.addEventListener('devicemotion', this.motionHandler!);
          }
        }).catch(() => {});
      } else {
        window.addEventListener('devicemotion', this.motionHandler);
      }
    }

    // 3. 5 rapid taps on app logo
    if (profile.silent_taps) {
      this.logoTapHandler = () => {
        this.tapCount++;
        if (this.tapTimer) clearTimeout(this.tapTimer);
        this.tapTimer = window.setTimeout(() => { this.tapCount = 0; }, 1500);
        if (this.tapCount >= 5) {
          this.tapCount = 0;
          this.trigger(true);
        }
      };
      // Listen for taps on elements with data-safestride-logo
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-safestride-logo]')) {
          this.logoTapHandler?.();
        }
      });
    }

    // 4. Keyboard shortcut (Ctrl+Shift+S)
    if (profile.silent_keyboard) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
          e.preventDefault();
          this.trigger(true);
        }
      };
      window.addEventListener('keydown', this.keyHandler);
    }
  }

  private trigger(test: boolean) {
    if (navigator.vibrate) navigator.vibrate(100);
    window.dispatchEvent(new CustomEvent('safestride-sos-trigger', { detail: { test } }));
  }

  destroy() {
    if (this.motionHandler) window.removeEventListener('devicemotion', this.motionHandler);
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    if (this.shakeTimer) clearTimeout(this.shakeTimer);
    if (this.tapTimer) clearTimeout(this.tapTimer);
  }
}
