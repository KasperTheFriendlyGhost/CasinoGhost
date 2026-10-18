import type { Rules } from '../engine/strategy';
import { BJ_PAYS } from '../engine/strategy';

const PAYS_WORDS: Record<string, string> = { '3:2': '3 TO 2', '6:5': '6 TO 5', '7:5': '7 TO 5', '2:1': '2 TO 1', '1:1': 'EVEN MONEY' };

/** The table layout printing, generated from the rules in play. */
export function FeltPrint({ rules }: { rules: Rules }) {
  const pays = (BJ_PAYS as Record<string, string>)[String(rules.bjPay)] ?? '3:2';
  const top = `BLACKJACK PAYS ${PAYS_WORDS[pays] ?? pays}`;
  const mid = rules.h17 ? 'DEALER MUST HIT SOFT 17' : 'DEALER MUST STAND ON ALL 17s';
  const low = rules.peek ? 'INSURANCE PAYS 2 TO 1' : 'NO HOLE CARD · INSURANCE PAYS 2 TO 1';
  return (
    <div className="pointer-events-none mx-auto -mt-1 w-[min(92%,600px)] select-none" aria-label={`${top}. ${mid}. ${low}.`}>
      <svg viewBox="0 0 600 150" className="block w-full" aria-hidden>
        <defs>
          <path id="arc1" d="M 40 30 Q 300 120 560 30" />
          <path id="arc2" d="M 90 58 Q 300 140 510 58" />
          <path id="arc3" d="M 56 93 Q 300 190 544 93" />
        </defs>
        <g fill="var(--felt-ink)" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.18em' }}>
          <text fontSize="22" fontWeight="800"><textPath href="#arc1" startOffset="50%" textAnchor="middle">{top}</textPath></text>
          <text fontSize="13" fontWeight="700"><textPath href="#arc2" startOffset="50%" textAnchor="middle">{mid}</textPath></text>
        </g>
        <path d="M 60 80 Q 300 175 540 80" fill="none" stroke="var(--felt-ink)" strokeWidth="1" opacity="0.6" />
        <path d="M 52 98 Q 300 196 548 98" fill="none" stroke="var(--felt-ink)" strokeWidth="1" opacity="0.6" />
        <text fill="var(--felt-ink)" fontSize="11" fontWeight="700" style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.3em' }}>
          <textPath href="#arc3" startOffset="50%" textAnchor="middle">{low}</textPath>
        </text>
      </svg>
    </div>
  );
}
