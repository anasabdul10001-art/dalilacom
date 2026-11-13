# Product behavior guidelines

## Profession-specific features

- Apply this rule to every profession and professional feature added in the future, in both the website and Android app.
- Keep ordinary users' profile pages simple. Hide profession-specific sections when the user has no real activity or relationship that makes the section relevant; do not show empty medical, trainee, or similar sections by default.
- Show the relevant user section after a real event creates it, such as a doctor connection or appointment, or a trainer sending the user a plan. Use the account's actual saved records to decide whether to show it.
- Show professional tools only to accounts whose profession supports them. Do not mix a professional's management tools with an ordinary user's activity sections.
- When adding a new profession, identify both sides of each feature: which controls belong to the professional, which section belongs to their customer/patient/student, and what real activity makes that section appear. Keep this behavior consistent across web and Android.

# Project memory

- At the start of every session, read the project skill `.claude/skills/dalilacom-context/SKILL.md`: what DALILACOM is, the owner's decisions and hard rules, and where the work stands.
- Before a session ends (or after a large piece of work), update its "Where we are" section and commit it, as that file describes.
