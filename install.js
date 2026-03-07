// @ts-check

const child_process = require('child_process')
const fs            = require('fs')
const util          = require('util')

async function install() {
    try {
        await util.promisify(child_process.execFile)('vsce', ['package', '-o', 'cpptheme.vsix'])
        await util.promisify(child_process.execFile)('code', ['--install-extension', 'cpptheme.vsix'])
    } finally {
        await fs.promises.rm('cpptheme.vsix', {force: true})
    }
}

install()