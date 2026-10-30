/**
 * Garde l'écran allumé : le téléphone est posé sur le piano et personne ne le
 * touche pendant qu'on joue. Le navigateur relâche ce verrou dès que la page
 * est masquée ; on le redemande donc quand elle redevient visible.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  /** Faux si le navigateur ne sait pas garder l'écran allumé (anciens iPhone notamment). */
  static get supported(): boolean {
    return 'wakeLock' in navigator;
  }

  acquire(): void {
    if (this.wanted) return;
    this.wanted = true;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    void this.request();
  }

  release(): void {
    this.wanted = false;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    void this.sentinel?.release().catch(() => undefined);
    this.sentinel = null;
  }

  private async request(): Promise<void> {
    if (!ScreenWakeLock.supported || document.visibilityState !== 'visible') return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (this.wanted) this.sentinel = sentinel;
      else void sentinel.release();
    } catch {
      // Refusé (économie d'énergie…) : l'écran suivra le réglage de mise en veille du téléphone.
    }
  }

  private readonly onVisibilityChange = () => {
    if (this.wanted && document.visibilityState === 'visible') void this.request();
  };
}
