document.addEventListener("DOMContentLoaded", () => {
  const warning = document.querySelector(".floating-warning");
  const closeWarning = document.querySelector("#closeWarning");
  const fileList = document.getElementById("fileList");
  const selectedFiles = [];

  // Warning functions
  function showWarning(message) {
    const warningMessage = document.querySelector("#warningMessage");
    warningMessage.textContent = message;
    warning.classList.add("show");
    warning.classList.remove("hide");
    setTimeout(() => {
      warning.classList.add("hide");
      warning.classList.remove("show");
    }, 5000);
  }

  closeWarning.addEventListener("click", () => {
    warning.classList.add("hide");
    warning.classList.remove("show");
  });

  // File input change event
  document
    .getElementById("pdfFiles")
    .addEventListener("change", function (event) {
      Array.from(event.target.files).forEach(function (file) {
        if (!selectedFiles.some((f) => f.file.name === file.name)) {
          const fileId = Date.now() + Math.random();
          selectedFiles.push({ file, fileid: fileId }); // Store both file and fileid together

          const listItem = document.createElement("li");
          listItem.textContent = file.name;
          listItem.dataset.filename = file.name;
          listItem.dataset.fileid = fileId; // Set fileid in the dataset for sorting later
          listItem.draggable = true;

          const removeBtn = document.createElement("button");
          removeBtn.textContent = "✖";
          removeBtn.className = "remove-btn";
          removeBtn.addEventListener("click", () => {
            fileList.removeChild(listItem);
            const index = selectedFiles.findIndex((f) => f.file === file);
            if (index > -1) {
              selectedFiles.splice(index, 1);
            }
            document.getElementById("pdfFiles").value = "";
          });

          listItem.appendChild(removeBtn);
          fileList.appendChild(listItem);
        }
      });
    });

  // Drag and drop events
  let dragSrcEl = null;

  function handleDragStart(event) {
    dragSrcEl = event.target;
    event.target.style.opacity = "0.4";

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", event.target.dataset.fileid);
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    return false;
  }

  function handleDragEnter(event) {
    if (event.target.tagName === "LI") {
      event.target.classList.add("drag-over");
    }
  }

  function handleDragLeave(event) {
    event.target.classList.remove("drag-over");
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();

    if (dragSrcEl !== event.target) {
      const draggingIndex = Array.from(fileList.children).indexOf(dragSrcEl);
      const targetIndex = Array.from(fileList.children).indexOf(event.target);

      if (draggingIndex < targetIndex) {
        fileList.insertBefore(dragSrcEl, event.target.nextSibling);
      } else {
        fileList.insertBefore(dragSrcEl, event.target);
      }

      updateSelectedFilesOrder();
    }

    event.target.classList.remove("drag-over");
    return false;
  }

  function handleDragEnd(event) {
    event.target.style.opacity = "1";
    fileList.querySelectorAll("li").forEach((item) => {
      item.classList.remove("drag-over");
    });
  }

  function updateSelectedFilesOrder() {
    const items = Array.from(fileList.children);
    selectedFiles.sort((a, b) => {
      return (
        items.indexOf(document.querySelector(`[data-fileid="${a.fileid}"]`)) -
        items.indexOf(document.querySelector(`[data-fileid="${b.fileid}"]`))
      );
    });
  }

  // Event listeners for drag and drop
  fileList.addEventListener("dragstart", handleDragStart);
  fileList.addEventListener("dragover", handleDragOver);
  fileList.addEventListener("dragenter", handleDragEnter);
  fileList.addEventListener("dragleave", handleDragLeave);
  fileList.addEventListener("drop", handleDrop);
  fileList.addEventListener("dragend", handleDragEnd);

  // Merge button event
  document
    .getElementById("mergeButton")
    .addEventListener("click", async function () {
      if (selectedFiles.length < 2) {
        showWarning("Please select at least 2 PDF files to merge.");
        return;
      }

      try {
        const pdfDoc = await PDFLib.PDFDocument.create();

        for (const { file } of selectedFiles) {
          const arrayBuffer = await file.arrayBuffer();
          const donorPdf = await PDFLib.PDFDocument.load(arrayBuffer);
          const copiedPages = await pdfDoc.copyPages(
            donorPdf,
            donorPdf.getPageIndices()
          );

          copiedPages.forEach((page) => {
            pdfDoc.addPage(page);
          });
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement("a");
        downloadLink.href = url;
        downloadLink.download = "merged.pdf";
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      } catch (error) {
        console.error("Error merging PDFs:", error);
        showWarning("An error occurred while merging the PDFs.");
      }
    });

  // Clear all button event
  document
    .getElementById("clearAllButton")
    .addEventListener("click", function () {
      if (selectedFiles.length === 0) {
        showWarning("No files to clear.");
        return;
      }

      if (window.confirm("Are you sure you want to clear all files?")) {
        fileList.innerHTML = "";
        selectedFiles.length = 0;
        document.getElementById("pdfFiles").value = "";
      }
    });
});
