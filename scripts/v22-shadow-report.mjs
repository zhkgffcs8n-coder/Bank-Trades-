import {readFile} from 'node:fs/promises';
import {scoreShadowRounds} from '../src/v22-shadow-scorecard.mjs';

try {
  const [input] = process.argv.slice(2);
  if (!input || process.argv.length !== 3) {
    throw new Error('Usage: node scripts/v22-shadow-report.mjs <paired-forward-rounds.json>');
  }

  const rounds = JSON.parse(await readFile(input, 'utf8'));
  if (!Array.isArray(rounds)) throw new Error('Expected an array of paired forward rounds');

  const score = scoreShadowRounds(rounds);
  console.log(JSON.stringify({
    ...score,
    evidenceStatus: score.pairedRounds ? 'DESCRIPTIVE_ONLY' : 'NO_VERIFIED_PAIRED_ROUNDS',
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
