/**
 * ==============================================================================
 * SUSHANT BHISHI - GOOGLE DRIVE AUTO-BACKUP WEBHOOK (GOOGLE APPS SCRIPT)
 * ==============================================================================
 * Automatically saves Sushant Bhishi database backup files into the Google Drive
 * folder "Sushant_Bishi_Backups".
 * 
 * ROLLING BACKUP FEATURE (STRICT 10 FILES LIMIT):
 * - Keeps only the latest 10 backup files in Google Drive.
 * - When the 11th backup is uploaded, it automatically deletes (trashes) the
 *   1st (oldest) backup file, so your Google Drive always retains only the
 *   10 most recent backups.
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Open Google Drive (https://drive.google.com).
 * 2. Click "+ New" -> "More" -> "Google Apps Script" (or visit https://script.google.com/home/start).
 * 3. Replace all existing code in the editor with this entire file.
 * 4. Click "Deploy" (top right) -> "New deployment".
 * 5. Select type: "Web app".
 * 6. Set Description: "Sushant Bhishi Backup Webhook v2 (10-file rolling prune)".
 * 7. Execute as: "Me (your Google account)".
 * 8. Who has access: "Anyone".
 * 9. Click "Deploy", review permissions, and copy the Web App URL.
 * 10. Paste the Web App URL into Sushant Bhishi App -> Backup & Restore -> Drive Webhook Settings.
 * ==============================================================================
 */

/**
 * Handles incoming POST requests containing backup data.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respondJson({
        status: 'error',
        success: false,
        message: 'No payload received in request body.'
      });
    }

    var payload = JSON.parse(e.postData.contents);
    var data = payload.data || {};
    var maxBackups = Number(payload.maxBackups) || 10; // Default limit: 10 files

    // Format backup filename
    var timestampStr = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd_HHmm');
    var filename = payload.filename || ('Sushant_Bishi_CloudDriveBackup_' + timestampStr + '.json');

    // 1. Locate or create the backup folder
    var folderName = 'Sushant_Bishi_Backups';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    // 2. Create the new backup file in Google Drive
    var fileContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    var newFile = folder.createFile(filename, fileContent, MimeType.PLAIN_TEXT);

    // 3. Enforce Rolling 10-File Limit (delete oldest if > 10 files)
    var fileIterator = folder.getFiles();
    var backupFiles = [];

    while (fileIterator.hasNext()) {
      var f = fileIterator.next();
      var fName = f.getName();
      // Match backup files by prefix or extension
      if (fName.indexOf('Sushant_Bishi_') !== -1 || fName.toLowerCase().endsWith('.json')) {
        backupFiles.push({
          file: f,
          id: f.getId(),
          name: fName,
          created: f.getDateCreated().getTime()
        });
      }
    }

    // Sort chronologically ascending (oldest first: index 0 is the 1st/oldest file)
    backupFiles.sort(function(a, b) {
      if (a.created !== b.created) {
        return a.created - b.created;
      }
      return a.name.localeCompare(b.name);
    });

    // Delete oldest files if total exceeds maxBackups (10 files)
    var deletedFiles = [];
    while (backupFiles.length > maxBackups) {
      var oldest = backupFiles.shift(); // Remove the 1st (oldest) file
      try {
        oldest.file.setTrashed(true); // Move oldest to trash
        deletedFiles.push({
          name: oldest.name,
          id: oldest.id
        });
      } catch (trashErr) {
        Logger.log('Could not trash file ' + oldest.name + ': ' + trashErr);
      }
    }

    return respondJson({
      status: 'success',
      success: true,
      message: 'Backup uploaded successfully to Google Drive.',
      fileId: newFile.getId(),
      fileName: filename,
      folderName: folderName,
      totalFilesInFolder: backupFiles.length,
      maxBackupsLimit: maxBackups,
      deletedOldestFiles: deletedFiles
    });

  } catch (err) {
    return respondJson({
      status: 'error',
      success: false,
      message: err.toString()
    });
  }
}

/**
 * Handles GET requests (Health Check & Endpoint Verification).
 */
function doGet(e) {
  return respondJson({
    status: 'ok',
    success: true,
    service: 'Sushant Bhishi Google Drive Backup Webhook',
    version: '2.0.0',
    folderName: 'Sushant_Bishi_Backups',
    maxBackupsLimit: 10,
    policy: 'Strict rolling 10-backup limit. Automatically deletes the 1st (oldest) backup file after uploading the 11th file.'
  });
}

/**
 * Helper to construct JSON response
 */
function respondJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
