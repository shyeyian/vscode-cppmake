// @ts-check

const vscode = require('vscode')
const sarif  = require('../contribute/view/sarif')

/** 
 * @param {vscode.ExtensionContext} context
 * @returns {void}
 */
function activate(context) {
    sarif.activate(context)
}

module.exports = {activate}
