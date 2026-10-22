/** Sonneries générées avec Web Audio (aucun fichier à charger) */

let context: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | undefined;

function beep(frequencies: number[], duration: number) {
    if (!context) {
        return;
    }
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.02);
    gain.gain.setValueAtTime(0.15, context.currentTime + duration - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    gain.connect(context.destination);
    frequencies.forEach(frequency => {
        const oscillator = context!.createOscillator();
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start();
        oscillator.stop(context!.currentTime + duration);
    });
}

/**
 * ring : sonnerie d'un appel entrant ; ringback : tonalité d'attente de l'appelant.
 * Le navigateur peut bloquer le son si l'utilisateur n'a pas encore interagi avec la page.
 */
export function startTone(kind: "ring" | "ringback") {
    stopTone();
    try {
        context = context || new AudioContext();
        context.resume().catch(() => undefined);
        const play = () => kind === "ring"
            ? (beep([880, 1320], 0.4), setTimeout(() => beep([880, 1320], 0.4), 500))
            : beep([440, 480], 1.2);
        play();
        timer = setInterval(play, kind === "ring" ? 2500 : 3500);
    } catch (error) {
        console.error(error);
    }
}

export function stopTone() {
    clearInterval(timer);
    timer = undefined;
}
