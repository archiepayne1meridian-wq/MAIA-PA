import { describe, it, expect } from 'vitest'
import { letterFor, scoreAnswer, resultFeedback, OPTION_LABELS } from './mcq'
import type { MCQQuestion } from './study-db'

function makeQ(correctIndex: number): MCQQuestion {
  return {
    q: 'What is the answer?',
    options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
    correctIndex,
    explanation: 'Because the rules say so.',
    module: 'Test',
  }
}

describe('letterFor', () => {
  it('maps 0→A, 1→B, 2→C, 3→D', () => {
    expect(letterFor(0)).toBe('A')
    expect(letterFor(1)).toBe('B')
    expect(letterFor(2)).toBe('C')
    expect(letterFor(3)).toBe('D')
  })

  it('OPTION_LABELS matches letterFor for every position', () => {
    OPTION_LABELS.forEach((label, i) => {
      expect(letterFor(i)).toBe(label)
    })
  })
})

describe('scoreAnswer', () => {
  it('returns true when choiceIndex equals correctIndex', () => {
    expect(scoreAnswer(0, 0)).toBe(true)
    expect(scoreAnswer(1, 1)).toBe(true)
    expect(scoreAnswer(2, 2)).toBe(true)
    expect(scoreAnswer(3, 3)).toBe(true)
  })

  it('returns false for every wrong choice at each correctIndex', () => {
    for (let correct = 0; correct < 4; correct++) {
      for (let choice = 0; choice < 4; choice++) {
        if (choice !== correct) {
          expect(scoreAnswer(correct, choice)).toBe(false)
        }
      }
    }
  })
})

describe('resultFeedback', () => {
  it('reports ✅ Correct when choiceIndex matches correctIndex', () => {
    const fb = resultFeedback(makeQ(2), 2)
    expect(fb).toMatch(/^✅ Correct\./)
    expect(fb).toContain('Because the rules say so.')
  })

  it('reports ❌ with the chosen letter when wrong', () => {
    const fb = resultFeedback(makeQ(2), 1) // chose B, correct is C
    expect(fb).toMatch(/^❌ You picked B\. Correct answer: C\./)
    expect(fb).toContain('Gamma') // correct option text
    expect(fb).toContain('Because the rules say so.')
  })

  it('letter in feedback matches letterFor — no independent mapping', () => {
    for (let correct = 0; correct < 4; correct++) {
      const correctLetter = letterFor(correct)
      const fb = resultFeedback(makeQ(correct), (correct + 1) % 4)
      expect(fb).toContain(`Correct answer: ${correctLetter}.`)
    }
  })
})

describe('scoring 100% — tapping correctIndex every time', () => {
  it('all four positions score correct', () => {
    const questions = [makeQ(0), makeQ(1), makeQ(2), makeQ(3)]
    const results = questions.map(q => scoreAnswer(q.correctIndex, q.correctIndex))
    expect(results).toEqual([true, true, true, true])
  })

  it('letter shown for an option equals letter used in feedback when that option is correct', () => {
    for (let i = 0; i < 4; i++) {
      const q = makeQ(i)
      const displayLetter = letterFor(i) // letter shown on the button
      const fb = resultFeedback(q, i)    // tap that button
      // Should show Correct, and the displayed letter should be the correct letter
      expect(fb).toMatch(/^✅ Correct\./)
      // Confirm letter consistency: if we instead tap a wrong option,
      // the correct answer reported must use the same letter as was displayed
      if (i < 3) {
        const wrongFb = resultFeedback(q, i + 1)
        expect(wrongFb).toContain(`Correct answer: ${displayLetter}.`)
      }
    }
  })
})
