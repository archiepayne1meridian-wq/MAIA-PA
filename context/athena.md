# ATHENA — Study Config

# Fill in the values below once you have your CISI enrolment details.
# Lines starting with # are comments and are ignored.
# After editing, save the file — changes take effect immediately (no restart needed).

exam_name:          # e.g. CISI Investment Advice Diploma Unit 1
exam_date:          # ISO date e.g. 2026-10-15
modules:
  -                 # Add module names from the CISI syllabus, one per line
  -                 # e.g. Pensions
  -                 # e.g. Cross-border tax
  -                 # e.g. Investment wrappers
weekly_hours:       # Study hours available per week e.g. 10
daily_quiz_size: 20 # MCQs per daily quiz (default 20)
priority_topics:
  -                 # Optional: topics to weight more heavily e.g. pension transfers
notebooklm:         # Link to your NotebookLM notebook (optional)

# ─── How ATHENA uses this file ────────────────────────────────────────────────
# exam_date → countdown shown in progress reports
# weekly_hours → used to size the weekly study plan
# daily_quiz_size → how many MCQs per "daily quiz" run
# modules / priority_topics → weighting for quiz topic selection
# notebooklm → shown in weakness reports as the handoff target
#
# ATHENA generates cards and MCQs only from material YOU provide.
# It never draws on its own knowledge of the CISI syllabus.
# Always verify generated content against the official CISI workbook.
