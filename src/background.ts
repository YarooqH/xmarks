import { getProfileDb, type Bookmark } from './db';
import { loadProfilesState, routeToAccount, saveProfilesState } from './db/profiles';
import { createBookmarkRepository } from './bookmarks/repository';
import { MSG, type ActionMessage } from './messages';
import { BACKUP_ALARM, runBackup } from './backup/runner';
import { isBackupDue, loadBackupLog, loadBackupSettings } from './backup/settings';

// Saves from X go to the saving profile. In auto mode that is the library of the X account the page
// reported, created on first sight. Resolved per call because the user can switch it at any time.
async function savingRepository(accountHandle?: string) {
  const state = await loadProfilesState();
  const routed = routeToAccount(state, accountHandle);
  if (routed !== state) await saveProfilesState(routed);
  return createBookmarkRepository(() => getProfileDb(routed.savingProfileId));
}

chrome.runtime.onMessage.addListener((message: ActionMessage, sender, sendResponse) => {
  if (message.type === MSG.SAVE_TWEET) {
    handleSaveTweet(message.payload, message.accountHandle)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === MSG.DELETE_BOOKMARK) {
    savingRepository(message.accountHandle).then(repo => repo.delete(message.payload.id))
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  
  if (message.type === MSG.CHECK_TWEET_SAVED) {
    savingRepository(message.accountHandle).then(repo => repo.get(message.payload.id))
      .then(bookmark => sendResponse({ saved: !!bookmark }))
      .catch(err => sendResponse({ saved: false, error: err.message }));
    return true;
  }

  if (message.type === MSG.IMPORT_BATCH) {
    handleImportBatch(message.payload, message.accountHandle)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === MSG.GET_CATEGORIES) {
    savingRepository(message.accountHandle).then(repo => repo.listCategories())
      .then(categories => sendResponse(categories))
      .catch(() => sendResponse([]));
    return true;
  }

  if (message.type === MSG.CREATE_CATEGORY) {
    const newCat = {
      id: 'cat_' + Date.now(),
      name: message.payload.name,
      createdAt: new Date(),
      sortOrder: Date.now()
    };
    savingRepository(message.accountHandle).then(repo => repo.createCategory(newCat))
      .then(() => sendResponse({ success: true, category: newCat }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // "Back up now" in the dashboard writes every library, changed or not.
  if (message.type === MSG.RUN_BACKUP) {
    runBackup({ force: true })
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === MSG.OPEN_DASHBOARD) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    sendResponse({ success: true });
    return true;
  }
});

async function handleSaveTweet(payload: Partial<Bookmark>, accountHandle?: string) {
  if (!payload.id) return { success: false, error: 'No tweet ID provided' };
  
  try {
    const result = await (await savingRepository(accountHandle)).save({ ...payload, id: payload.id });
    if (!result.created) {
      return { success: true, message: 'Updated existing bookmark', id: payload.id };
    }
    chrome.storage?.local?.get('xmarks_onboarding', result => {
      const state = result?.xmarks_onboarding || { version: 1 };
      chrome.storage?.local?.set({
        xmarks_onboarding: { ...state, firstSaveCompleted: true, firstSaveCompletedAt: new Date().toISOString() }
      });
    });
    return { success: true, id: payload.id };
  } catch (error: any) {
    console.error('Error saving tweet:', error);
    return { success: false, error: error.message };
  }
}

async function handleImportBatch(payload: Partial<Bookmark>[], accountHandle?: string) {
  try {
    const result = await (await savingRepository(accountHandle)).importBatch(
      payload.filter((bookmark): bookmark is Partial<Bookmark> & Pick<Bookmark, 'id'> => Boolean(bookmark.id))
    );

    if (result.count > 0) {
      chrome.storage?.local?.get('xmarks_onboarding', stored => {
        const state = stored?.xmarks_onboarding || { version: 1 };
        chrome.storage?.local?.set({
          xmarks_onboarding: { ...state, firstSyncCompleted: true, firstSyncCompletedAt: new Date().toISOString() }
        });
      });
    }
    return { success: true, count: result.count };
  } catch (error: any) {
    console.error('Error importing batch:', error);
    return { success: false, error: error.message };
  }
}

// Automatic backups: an hourly check writes one when the chosen interval has passed.
// Chrome can drop alarms when the extension updates, so the worker recreates it whenever it starts.
chrome.alarms.get(BACKUP_ALARM).then(alarm => {
  if (!alarm) chrome.alarms.create(BACKUP_ALARM, { delayInMinutes: 1, periodInMinutes: 60 });
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== BACKUP_ALARM) return;
  const [settings, log] = await Promise.all([loadBackupSettings(), loadBackupLog()]);
  if (isBackupDue(settings, log)) runBackup().catch(err => console.error('Automatic backup failed:', err));
});
