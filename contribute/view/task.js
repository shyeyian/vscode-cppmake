// @ts-check

const path   = require('path')
const vscode = require('vscode')

/**
 * @implements {vscode.TreeDataProvider<Task>}
 */
class TaskTreeDataProvider {
    /** @type {vscode.Event<void>} */
    onDidChangeTreeData

    constructor() {
        this._taskList           = new TaskList()
        this._refreshEmitter     = new vscode.EventEmitter()
        this.onDidChangeTreeData = this._refreshEmitter.event
    }

    /**
     * @param {Task} element
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element) {
        return element.treeItem
    }

    /**
     * @param {void | TaskList} element
     * @returns {Promise<Task[]>}
     */
    async getChildren(element) {
        if (element == undefined) {
            this._sarifFileList = await new TaskList().create() 
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

    /** @type {TaskList} */
    _taskList

    /** @type {vscode.EventEmitter<void>} */
    _refreshEmitter
}

class TaskList {
    /** @type {Task[]} */
    children

    constructor() {
        this.children = []
    }

    /** @returns {Promise<TaskList>} */
    async create() {
        if (vscode.workspace.workspaceFolders != undefined)
            for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                const taskFile = vscode.Uri.joinPath(workspaceFolder.uri, '.vscode', 'tasks.json')
                let   taskJson
                try {
                    taskJson = JSON.parse((await vscode.workspace.fs.readFile(taskFile)).toString())
                } catch (error) {
                    console.warn(`failed reading tasks.json file (with file = ${taskFile})`, {cause: error})
                }
                for (const task of taskJson.tasks)
                    this.children.push(task)
            }
        return this
    }
}

class Task {
    /** @type {vscode.TreeItem} */
}