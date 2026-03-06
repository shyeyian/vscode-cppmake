// @ts-check

const path   = require('path')
const vscode = require('vscode')

/**
 * @implements {vscode.TreeDataProvider<SarifFile | SarifResult | SarifRelatedLocation>}
 */
class SarifTreeDataProvider {
    /** @type {vscode.Event<void>} */
    onDidChangeTreeData

    constructor() {
        this._sarifFileList      = new SarifFileList()
        this._refreshEmitter     = new vscode.EventEmitter()
        this.onDidChangeTreeData = this._refreshEmitter.event
    }

    /**
     * @param {SarifFile | SarifResult | SarifRelatedLocation} element
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element) {
        const treeItem = element.treeItem
        treeItem.collapsibleState = 
            element.children.length >= 1 ? 
                vscode.TreeItemCollapsibleState.Collapsed :
                vscode.TreeItemCollapsibleState.None
        return treeItem
    }

    /**
     * @param {void | SarifFile | SarifResult | SarifRelatedLocation} element
     * @returns {Promise<SarifFile[] | SarifResult[] | SarifRelatedLocation[]>}
     */
    async getChildren(element) {
        if (element == undefined) {
            this._sarifFileList = await new SarifFileList().create() 
            return this._sarifFileList.children
        }
        else
            return element.children
    }

    /**
     * @returns {void}
     */
    refresh() {
        this._refreshEmitter.fire()
    }

    /** @type {SarifFileList} */
    _sarifFileList

    /** @type {vscode.EventEmitter<void>} */
    _refreshEmitter
}

class SarifFileList {
    /** @type {SarifFile[]} */
    children

    constructor() {
        this.children = []
    }

    /** @returns {Promise<SarifFileList>} */
    async create() {
        if (vscode.workspace.workspaceFolders != undefined)
            for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                const directory = vscode.Uri.joinPath(workspaceFolder.uri, vscode.workspace.getConfiguration('cppsarif').get('sarifDirectory') ?? '.')
                    try {
                        for await (const file of _recursiveIterateDirectory(directory))
                            if (file.path.endsWith('.sarif')) {
                                try {
                                    const sarifFile = await new SarifFile().read(directory, file)
                                    if (sarifFile.children.length >= 1)
                                        this.children.push(sarifFile)
                                } catch (error) {
                                    console.warn(`failed to read sarif file (with file = ${file})`, {cause: error})
                                }
                            }
                    } catch (error) {
                        console.warn(`failed to reading sarif directory (with directory = ${directory})`, {cause: error})
                    }
                }
        return this
    }
}

class SarifFile {    
    /** @type {vscode.TreeItem} */
    treeItem

    /** @type {SarifResult[]} */
    children

    constructor() {
        this.treeItem = new vscode.TreeItem('')
        this.children = []
    }

    /**
     * @param {vscode.Uri} directory
     * @param {vscode.Uri} file
     * @returns {Promise<SarifFile>}
     */
    async read(directory, file) {
        const sarif            = JSON.parse((await vscode.workspace.fs.readFile(file)).toString())
        this.treeItem          = new vscode.TreeItem('')
        this.treeItem.label    = path.relative(directory.fsPath, file.fsPath).replace(/\.sarif$/, '')
        this.treeItem.id       = path.relative(directory.fsPath, file.fsPath).replace(/\.sarif$/, '')
        this.treeItem.iconPath = _getIconPath('file')
        for (const run of sarif.runs)
            for (const [resultIndex, result] of run.results.entries())
                this.children.push(new SarifResult(result, resultIndex, run))
        return this
    }
}

class SarifResult {
    /** @type {vscode.TreeItem} */
    treeItem

    /** @type {SarifRelatedLocation[]} */
    children

    /**
     * @param {_Json} result
     * @param {number} resultIndex
     * @param {_Json} parentRun
     */
    constructor(result, resultIndex, parentRun) {
        this.treeItem              = new vscode.TreeItem('')
        this.treeItem.label        = result?.message?.text
        this.treeItem.id           = resultIndex.toString()
        this.treeItem.iconPath     = _getIconPath(result.level)
        this.treeItem.description  = result.locations?.[0]?.logicalLocations?.[0]?.name
        this.treeItem.command      = _showPhysicalLocation(result.locations?.[0].physicalLocation, parentRun.originalUriBaseIds)
        this.children              = []
        if (result.relatedLocations != undefined) {
            /** @type {Map<number, any>} */
            const mountable = new Map([[-1, this], [0, this]])
            for (const relatedLocation of result.relatedLocations)
                if (relatedLocation.message != undefined) {
                    const sarifRelatedLocation = new SarifRelatedLocation(relatedLocation, parentRun)
                    mountable.get(relatedLocation.properties.nestingLevel - 1)?.children.push(sarifRelatedLocation)
                    mountable.set(relatedLocation.properties.nestingLevel, sarifRelatedLocation)  
                }                        
        }
    }
}

class SarifRelatedLocation {
    /** @type {vscode.TreeItem} */
    treeItem

    /** @type {SarifRelatedLocation[]} */
    children

    /**
     * @param {_Json} relatedLocation
     * @param {_Json} parentRun
     */
    constructor(relatedLocation, parentRun) {
        this.treeItem             = new vscode.TreeItem('')
        this.treeItem.label       = relatedLocation?.message?.text
        this.treeItem.id          = relatedLocation.id
        this.treeItem.iconPath    = _getIconPath('note')
        this.treeItem.description = relatedLocation.logicalLocations
        this.treeItem.command     = _showPhysicalLocation(relatedLocation.physicalLocation, parentRun.originalUriBaseIds)
        this.children             = []
    }
}

const sarifTreeDataProvider = new SarifTreeDataProvider()

const sarifView = vscode.window.createTreeView('sarif', {
    treeDataProvider: sarifTreeDataProvider
})

const sarifViewRefreshDaemon = sarifView.onDidChangeVisibility(view => {
    if (view.visible)
        sarifTreeDataProvider.refresh()
})

const showPhysicalLocationCommand = vscode.commands.registerCommand('showPhysicalLocation', async (physicalLocation, originalUriBaseIds) => {
    const editor = await vscode.window.showTextDocument(
        physicalLocation.artifactLocation.uriBaseId != undefined ? 
            vscode.Uri.joinPath(vscode.Uri.parse(originalUriBaseIds[physicalLocation.artifactLocation.uriBaseId].uri), physicalLocation.artifactLocation.uri) : 
            vscode.Uri.parse(physicalLocation.artifactLocation.uri),
        {preview: false}
    )
    const selectBegin = new vscode.Position(
        physicalLocation.region.startLine   - 1, 
        physicalLocation.region.startColumn - 1
    )
    const selectEnd = new vscode.Position(
        physicalLocation.region.endLine != undefined ? 
            physicalLocation.region.endLine   - 1 :
            physicalLocation.region.startLine - 1, 
        physicalLocation.region.endColumn - 1
    )
    editor.revealRange(new vscode.Range(selectBegin, selectEnd), vscode.TextEditorRevealType.InCenter)
    editor.selection = new vscode.Selection(selectBegin, selectEnd)
})



/** @typedef {boolean | number | string | _Json[] | { [key: string]: _Json}} _Json */

/**
 * @param {vscode.Uri} directory
 * @returns {AsyncGenerator<vscode.Uri>}
 */
async function* _recursiveIterateDirectory(directory) {
    for await (const [name, fileType] of await vscode.workspace.fs.readDirectory(directory))
        if (fileType == vscode.FileType.File)
            yield vscode.Uri.joinPath(directory, name)
        else if (fileType == vscode.FileType.Directory)
            for await (const subfile of _recursiveIterateDirectory(vscode.Uri.joinPath(directory, name)))
                yield subfile
}

/**
 * @param {string} name
 * @returns {vscode.ThemeIcon}
 */
function _getIconPath(name) {
    // Explicit write each case here.
    return name == 'file'    ? new vscode.ThemeIcon('file')    :
           name == 'error'   ? new vscode.ThemeIcon('error')   :
           name == 'warning' ? new vscode.ThemeIcon('warning') :
           name == 'note'    ? new vscode.ThemeIcon('more')    :
                               new vscode.ThemeIcon('more')
}

/**
 * @param {_Json} physicalLocation
 * @param {_Json} originalUriBaseIds
 * @returns {vscode.Command | undefined}
 */
function _showPhysicalLocation(physicalLocation, originalUriBaseIds) {
    return {
        title    : 'showPhysicalLocation',
        command  : 'showPhysicalLocation',
        tooltip  : 'showPhysicalLocation',
        arguments: [physicalLocation, originalUriBaseIds]
    }
}



/**
 * @param {vscode.ExtensionContext} context
 * @returns {void}
 */
function activate(context) {
    context.subscriptions.push(sarifView)
    context.subscriptions.push(sarifViewRefreshDaemon)
    context.subscriptions.push(showPhysicalLocationCommand)
}

module.exports = {activate}
