// Upload progress percent
var uploadProgress = new ReactiveVar(0);
// Currently selected file
var selectedFile = new ReactiveVar();
// Track if file is being uploaded
var uploading = new ReactiveVar(false);
// File Id
var uploadedFileId = null;
// AutoForm object
var CfsAutoForm = CfsAutoForm || {};
// Tracks AutoForm hooks
var hookTracking = {};

CfsAutoForm.Hooks = {
    // Before inserting, validate file
    beforeInsert: function (doc, template) {
        var self = this;

        // Get form Id or die
        if (!AutoForm.validateForm(self.formId)) {
            return false;
        }

        // Selected file
        var file = selectedFile.get();
        // Check if file is selected or die
        if (file) {
            // Resumable file error event
            Videos.resumable.on('fileError', function (file, message) {

                // Stop uploading
                uploading.set(false);
                // TODO: Delete the file locally, this is done server side already

                // Check if file is of correct file type
                // TODO: Make this configurable
                if (!file.contentType == 'video/mp4') {
                    return self.result(new Error("Submission failed"));
                }

                return self.result(false);
            });

            // Resumable complete event
            Videos.resumable.on('complete', function () {
                // Set file Id to document
                uploadedFileId = doc.videoFile;
                return self.result(doc);
            });

            Videos.insert({
                    // This is the ID resumable will use
                    _id: file.uniqueIdentifier,
                    filename: file.fileName,
                    contentType: file.file.type
                },
                // Callback to .insert
                function (error, result) {
                    if (error) {
                        // Die on error
                        // TODO: Handle event to show error message inside module, currently handled externally
                        uploading.set(false);
                        return self.result(false);
                    } else {
                        // Set file Id in DB
                        doc.videoFile = file.uniqueIdentifier;
                    }

                    // Once the file exists on the server, start uploading
                    Videos.resumable.upload();
                    uploading.set(true);
                }
            );

        } else {
            return false;
        }
    },
    afterInsert: function (error, result, template) {
        // Roll back on error, this should not happen as Meteor handles most errors
        if (error) {
            Videos.remove({_id: new Meteor.Collection.ObjectID(uploadedFileId)})
        }
        uploading.set(false);
    }
};

Template.autoformFileCollection.helpers({
    // Get file name if selected
    fileName: function () {
        var result = null;
        var file = selectedFile.get();
        if (file) {
            result = file.fileName;
        }
        return result;
    },
    // Get progress percent
    uploadProgress: function () {
        return uploadProgress.get();
    },
    // Check if uploading
    uploading: function () {
        return uploading.get();
    }
});

Template.autoformFileCollection.rendered = function () {

    // Get AutoForm Id
    var formId = AutoForm.getFormId();
    // If dev has not added form Id, add it
    if (!hookTracking[formId]) {
        hookTracking[formId] = true;
        addAFHook(formId);
    }
    // Set resumable file type
    // TODO: Make this configurable
    Videos.resumable.fileType = ['mp4'];

    // Set elements for resumable
    Videos.resumable.assignDrop($(".fileDrop"));
    Videos.resumable.assignBrowse($('.fileBrowse'));

    // Resumable file progress event, this needs to be setup after rendered
    Videos.resumable.on('fileProgress', function (file) {
        // Set upload percentage
        uploadProgress.set(Math.floor(100 * file.progress()));
    });

    // Resumable file added event, this needs to be setup after rendered
    Videos.resumable.on('fileAdded', function (file) {
        // Set seleced file
        selectedFile.set(file);
    });

};

// Add to AutoForm hooks, this should happen after parent template hooks
function addAFHook(formId) {
    AutoForm.addHooks(formId, {
        before: {
            insert: CfsAutoForm.Hooks.beforeInsert
        },
        after: {
            insert: CfsAutoForm.Hooks.afterInsert
        }
    });
}

// Configure AutoFrom
AutoForm.addInputType("video-file", {
    template: "autoformFileCollection",
    valueOut: function () {
        var result = null;
        // Sets a dummy Id to be used until file upload has completed
        // This is to clear error messages after a file is selected, as the
        // file is not uploaded until form is valid and the form is not valid until the file is uploaded
        if (selectedFile.get()) {
            result = 'dummyId';
        }
        return result;
    }
});