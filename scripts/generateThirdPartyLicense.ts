/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-require-imports */
// @ts-nocheck
'use strict'

const path = require('path')
const fs = require('fs')
const thirdPartyChecker = require('./thirdPartyChecker.js')
const desktopRoot = path.resolve(__dirname, '..', 'packages/desktop')

thirdPartyChecker.getLicenses(desktopRoot, (err, packages) => {
  if (err) {
    console.log(`[ERROR] ${err}`)
    return
  }

  let summary = ''
  let licenseList = ''
  let index = 1
  const addedKeys = {}

  Object.keys(packages).forEach((key) => {
    let packageName = key
    const nameRegex = /(^.+)(?:@)/.exec(key)
    if (nameRegex && nameRegex[1]) {
      packageName = nameRegex[1]
    }

    if (Object.hasOwn(addedKeys, packageName)) {
      return
    }
    addedKeys[packageName] = 1

    const { licenses, licenseText, licenseFile } = packages[key]
    const bundledLicenseText = licenseText || (licenseFile ? fs.readFileSync(licenseFile, 'utf8') : licenses)
    summary += `${index++}. ${packageName} (${licenses})\n`
    licenseList += `# ${packageName} (${licenses})
-------------------------------------------------\

${bundledLicenseText}
\n\n
`
  })

  const output = `# Third Party Notices
-------------------------------------------------

This file contains all third-party packages that are bundled and shipped with YarkText.

-------------------------------------------------
# Summary
-------------------------------------------------

${summary}

-------------------------------------------------
# Licenses
-------------------------------------------------

${licenseList}
`

  fs.writeFileSync(path.resolve(desktopRoot, 'build', 'THIRD-PARTY-LICENSES.txt'), output.replace(/[ \t]+$/gm, '').trimEnd() + '\n')
  console.log('THIRD-PARTY-LICENSES.txt generated successfully.')
})
