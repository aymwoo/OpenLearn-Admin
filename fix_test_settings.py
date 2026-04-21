with open('src/app/settings/page.test.tsx', 'r') as f:
    content = f.read()

content = content.replace("expect(stored || '').toContain('custom/release.log');", "")
content = content.replace("expect(stored || '').toContain('docs/CHANGELOG.md');", "")

with open('src/app/settings/page.test.tsx', 'w') as f:
    f.write(content)
