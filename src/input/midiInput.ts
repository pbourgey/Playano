/**
 * Entrée « clavier MIDI » : si un piano numérique est branché (USB / Bluetooth),
 * ses notes sont reçues directement, sans passer par le micro.
 * Disponible dans Chrome, Edge et Firefox ; pas dans Safari.
 */
export class MidiKeyboardInput {
  private access: MIDIAccess | null = null;
  onNote: ((midi: number) => void) | null = null;
  onDevicesChange: ((names: string[]) => void) | null = null;

  get supported(): boolean {
    return typeof navigator.requestMIDIAccess === 'function';
  }

  async start(): Promise<void> {
    if (!this.supported || this.access) return;
    try {
      this.access = await navigator.requestMIDIAccess();
    } catch {
      return; // Refusé ou indisponible : le micro reste utilisable.
    }
    this.access.onstatechange = () => this.bind();
    this.bind();
  }

  get deviceNames(): string[] {
    return this.access ? [...this.access.inputs.values()].map((input) => input.name ?? 'Clavier MIDI') : [];
  }

  private bind(): void {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) {
      input.onmidimessage = (event) => {
        const data = event.data;
        if (!data || data.length < 3) return;
        const isNoteOn = (data[0] & 0xf0) === 0x90 && data[2] > 0;
        if (isNoteOn) this.onNote?.(data[1]);
      };
    }
    this.onDevicesChange?.(this.deviceNames);
  }
}
