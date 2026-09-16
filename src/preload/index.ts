import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { RunEvent, TeutonApi } from '../shared/types'

const api: TeutonApi = {
  detect: () => ipcRenderer.invoke(IPC.detect),
  pickDirectory: () => ipcRenderer.invoke(IPC.pickDirectory),
  createProject: (dir) => ipcRenderer.invoke(IPC.createProject, dir),
  openProject: (dir, cname) => ipcRenderer.invoke(IPC.openProject, dir, cname),
  saveProject: (files) => ipcRenderer.invoke(IPC.saveProject, files),
  check: (dir, cname) => ipcRenderer.invoke(IPC.check, dir, cname),
  run: (dir, options, runId) => ipcRenderer.invoke(IPC.runStart, dir, options, runId),
  cancelRun: (runId) => ipcRenderer.invoke(IPC.runCancel, runId),
  keepAwake: (active) => ipcRenderer.invoke(IPC.keepAwake, active),
  onRunEvent: (cb) => {
    const listener = (_e: unknown, event: RunEvent): void => cb(event)
    ipcRenderer.on(IPC.runEvent, listener)
    return () => ipcRenderer.removeListener(IPC.runEvent, listener)
  },
  loadResults: (dir, testName, outDir) => ipcRenderer.invoke(IPC.loadResults, dir, testName, outDir),
  exportAs: (dir, format) => ipcRenderer.invoke(IPC.exportAs, dir, format),
  saveFileDialog: (defaultName, content) =>
    ipcRenderer.invoke(IPC.saveFileDialog, defaultName, content),
  recentProjects: () => ipcRenderer.invoke(IPC.recentProjects),
  removeRecent: (dir) => ipcRenderer.invoke(IPC.removeRecent, dir),
  openPath: (target) => ipcRenderer.invoke(IPC.openPath, target),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  getGrading: () => ipcRenderer.invoke(IPC.getGrading),
  setGrading: (grading) => ipcRenderer.invoke(IPC.setGrading, grading),
  getDefaultGlobals: () => ipcRenderer.invoke(IPC.getDefaultGlobals),
  setDefaultGlobals: (globals) => ipcRenderer.invoke(IPC.setDefaultGlobals, globals),
  getCredentialsStatus: () => ipcRenderer.invoke(IPC.getCredentialsStatus),
  listClasses: () => ipcRenderer.invoke(IPC.listClasses),
  saveClass: (roster) => ipcRenderer.invoke(IPC.saveClass, roster),
  deleteClass: (id) => ipcRenderer.invoke(IPC.deleteClass, id),
  getRecords: (dir, classId) => ipcRenderer.invoke(IPC.getRecords, dir, classId),
  updateRecords: (dir, grades, classId) => ipcRenderer.invoke(IPC.updateRecords, dir, grades, classId),
  resetRecords: (dir, classId) => ipcRenderer.invoke(IPC.resetRecords, dir, classId),
  listRecordBackups: (dir) => ipcRenderer.invoke(IPC.listRecordBackups, dir),
  restoreRecordBackup: (dir, id, classId) =>
    ipcRenderer.invoke(IPC.restoreRecordBackup, dir, id, classId),
  getProjectMeta: (dir) => ipcRenderer.invoke(IPC.getProjectMeta, dir),
  setProjectMeta: (dir, meta) => ipcRenderer.invoke(IPC.setProjectMeta, dir, meta),
  writeClassCsv: (dir, className, classId, content) =>
    ipcRenderer.invoke(IPC.writeClassCsv, dir, className, classId, content),
  getTeutonPath: () => ipcRenderer.invoke(IPC.getTeutonPath),
  setTeutonPath: (path) => ipcRenderer.invoke(IPC.setTeutonPath, path)
}

contextBridge.exposeInMainWorld('teuton', api)
