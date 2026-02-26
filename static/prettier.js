// Timetable Prettier - JavaScript

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const DAY_NAMES = {
    'MON': 'Monday',
    'TUE': 'Tuesday',
    'WED': 'Wednesday',
    'THU': 'Thursday',
    'FRI': 'Friday'
};

// Course color assignments
const courseColors = new Map();
let colorIndex = 0;
const COLORS = [
    'var(--course-1)',
    'var(--course-2)',
    'var(--course-3)',
    'var(--course-4)',
    'var(--course-5)',
    'var(--course-6)',
    'var(--course-7)',
    'var(--course-8)'
];

function getCourseColor(courseCode) {
    if (!courseColors.has(courseCode)) {
        courseColors.set(courseCode, COLORS[colorIndex % COLORS.length]);
        colorIndex++;
    }
    return courseColors.get(courseCode);
}

// DOM Elements
const sectionSelect = document.getElementById('section-select');
const fileUpload = document.getElementById('file-upload');
const uploadArea = document.getElementById('upload-area');
const loading = document.getElementById('loading');
const timetableContainer = document.getElementById('timetable-container');
const sectionTitle = document.getElementById('section-title');
const timetable = document.getElementById('timetable');
const downloadImageBtn = document.getElementById('download-image');
const downloadPdfBtn = document.getElementById('download-pdf');

// Current section name for downloads
let currentSectionName = 'timetable';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadSections();
    setupEventListeners();
    setupDownloadListeners();
});

async function loadSections() {
    const defaultOption = sectionSelect.querySelector('option');
    try {
        const cacheKey = 'prettier_sections';
        const cacheTimeKey = 'prettier_sections_time';

        const cachedSections = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(cacheTimeKey);
        const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;

        let sections = [];

        // Use cache if less than 24 hours old
        if (cachedSections && cacheAge < 24 * 60 * 60 * 1000) {
            sections = JSON.parse(cachedSections);
        } else {
            if (defaultOption) {
                defaultOption.textContent = "Loading sections...";
                sectionSelect.disabled = true;
            }

            try {
                const response = await fetch('/api/prettier/sections');
                const data = await response.json();
                sections = data.sections || [];

                // Save to cache
                localStorage.setItem(cacheKey, JSON.stringify(sections));
                localStorage.setItem(cacheTimeKey, Date.now().toString());
            } finally {
                if (defaultOption) {
                    defaultOption.textContent = "Choose a section...";
                    sectionSelect.disabled = false;
                }
            }
        }

        sections.forEach(section => {
            const option = document.createElement('option');
            option.value = section.id;
            option.textContent = section.name;
            option.dataset.name = section.name;
            sectionSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load sections:', error);
        if (defaultOption) {
            defaultOption.textContent = "Error loading sections";
            sectionSelect.disabled = false;
        }
    }
}

function setupEventListeners() {
    // Section select
    sectionSelect.addEventListener('change', async (e) => {
        if (e.target.value) {
            const selectedOption = e.target.options[e.target.selectedIndex];
            await loadTimetable(e.target.value, selectedOption.dataset.name);
        }
    });

    // File upload - click
    uploadArea.addEventListener('click', () => {
        fileUpload.click();
    });

    // File upload - change
    fileUpload.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            await uploadAndParse(e.target.files[0]);
        }
    });

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');

        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type === 'application/pdf') {
                await uploadAndParse(file);
            } else {
                alert('Please upload a PDF file');
            }
        }
    });
}

async function loadTimetable(sectionId, sectionName = "") {
    showLoading();

    try {
        const nameQuery = sectionName ? `?name=${encodeURIComponent(sectionName)}` : '';
        const response = await fetch(`/api/prettier/timetable/${sectionId}${nameQuery}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        renderTimetable(data);
    } catch (error) {
        console.error('Failed to load timetable:', error);
        alert('Failed to load timetable: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function uploadAndParse(file) {
    showLoading();

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Clear section select
        sectionSelect.value = '';

        renderTimetable(data);
    } catch (error) {
        console.error('Failed to parse uploaded file:', error);
        alert('Failed to parse uploaded file: ' + error.message);
    } finally {
        hideLoading();
    }
}

function showLoading() {
    loading.classList.remove('hidden');
    timetableContainer.classList.add('hidden');
}

function hideLoading() {
    loading.classList.add('hidden');
}

function renderTimetable(data) {
    // Reset color assignments for new timetable
    courseColors.clear();
    colorIndex = 0;

    // Set title and track section name for downloads
    currentSectionName = `Section_${data.section}`;
    sectionTitle.textContent = `SECTION ${data.section}`;

    // Build table
    const slots = data.time_slots;
    const slotTimes = data.slot_times;
    const hasBreak = slots.includes(6);

    // Check if any day has a class in slot 6 (break period)
    // Heuristic:
    // 1. If any code is length > 1, it's a real class
    // 2. If codes are single letter, check frequency. Vertical "BREAK" spans ~5 days.
    //    Real classes usually appear on fewer days (e.g. 1-3 days).
    const daysWithBreakData = DAYS.filter(day => {
        const dayData = data.timetable[day] || {};
        return dayData[6] && dayData[6].code;
    });

    const hasLongCodes = DAYS.some(day => {
        const dayData = data.timetable[day] || {};
        return dayData[6] && dayData[6].code && dayData[6].code.length > 1;
    });

    // It's a real class if we have long codes OR if single-letter codes appear on few days (< 4)
    const hasBreakClasses = hasLongCodes || (daysWithBreakData.length > 0 && daysWithBreakData.length < 4);

    let html = '<thead><tr><th class="day-header">Day</th>';

    // Header row with time slots
    slots.forEach(slot => {
        const time = slotTimes[slot] || '';
        if (slot === 6 && !hasBreakClasses) {
            // Break header (only when no classes in break period)
            html += `<th class="break-header">
                <span>BREAK</span>
                <span class="time-slot">${time}</span>
            </th>`;
        } else {
            html += `<th>
                <span>${slot}</span>
                <span class="time-slot">${time}</span>
            </th>`;
        }
    });

    html += '</tr></thead><tbody>';

    // Day rows - handle break slot conditionally
    DAYS.forEach((day, dayIndex) => {
        html += `<tr><td class="day-cell">${day}</td>`;

        const dayData = data.timetable[day] || {};

        slots.forEach(slot => {
            if (slot === 6 && !hasBreakClasses) {
                // Break column - only render the merged cell on first day
                if (dayIndex === 0) {
                    html += `<td class="break-cell" rowspan="5">
                        <div class="break-content">
                            <span>B</span>
                            <span>R</span>
                            <span>E</span>
                            <span>A</span>
                            <span>K</span>
                        </div>
                    </td>`;
                }
                // Skip for other days since rowspan covers them
            } else {
                const cellData = dayData[slot];

                if (cellData && cellData.code) {
                    const color = getCourseColor(cellData.code);
                    html += `<td>
                        <div class="course-cell" style="background: ${color};">
                            <div class="course-name">${escapeHtml(cellData.name)}</div>
                            <div class="course-code">${escapeHtml(cellData.code)}</div>
                            <div class="course-location">${escapeHtml(cellData.location)}</div>
                            <div class="course-lecturer">${escapeHtml(cellData.lecturer)}</div>
                        </div>
                    </td>`;
                } else {
                    html += '<td class="empty-cell"></td>';
                }
            }
        });

        html += '</tr>';
    });

    html += '</tbody>';

    timetable.innerHTML = html;
    timetableContainer.classList.remove('hidden');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupDownloadListeners() {
    downloadImageBtn.addEventListener('click', downloadAsImage);
    downloadPdfBtn.addEventListener('click', downloadAsPdf);
}

const EXPORT_TARGET_WIDTH = 1920;
const EXPORT_TARGET_HEIGHT = 1080;
const EXPORT_PADDING = 48;
const EXPORT_MAX_CANVAS_DIMENSION = 4096;

function getSafeExportScale(windowWidth, windowHeight) {
    const maxDimension = Math.max(windowWidth, windowHeight);
    const safeScale = EXPORT_MAX_CANVAS_DIMENSION / maxDimension;
    return Math.max(0.5, Math.min(2, safeScale));
}

function getExportConfig(scale) {
    return {
        backgroundColor: '#0f0f1a',
        scale: scale,
        useCORS: true,
        logging: false
    };
}

function createExportSnapshot(exportArea) {
    const snapshotHost = document.createElement('div');
    snapshotHost.style.position = 'fixed';
    snapshotHost.style.left = '0';
    snapshotHost.style.top = '0';
    snapshotHost.style.width = '0';
    snapshotHost.style.height = '0';
    snapshotHost.style.overflow = 'visible';
    snapshotHost.style.pointerEvents = 'none';
    snapshotHost.style.opacity = '0';
    snapshotHost.style.zIndex = '-1';

    const snapshot = exportArea.cloneNode(true);
    snapshot.style.position = 'absolute';
    snapshot.style.left = '0';
    snapshot.style.top = '0';
    snapshotHost.appendChild(snapshot);
    document.body.appendChild(snapshotHost);

    snapshot.style.width = EXPORT_TARGET_WIDTH + 'px';
    snapshot.style.height = EXPORT_TARGET_HEIGHT + 'px';
    snapshot.style.minHeight = EXPORT_TARGET_HEIGHT + 'px';
    snapshot.style.display = 'flex';
    snapshot.style.flexDirection = 'column';
    snapshot.style.padding = EXPORT_PADDING + 'px';
    snapshot.style.boxSizing = 'border-box';
    snapshot.style.margin = '0';
    snapshot.style.backgroundColor = '#0f0f1a';
    snapshot.style.overflow = 'hidden';

    const clonedTitle = snapshot.querySelector('.section-title');
    if (clonedTitle) {
        clonedTitle.style.flexShrink = '0';
        clonedTitle.style.marginBottom = '36px';
        clonedTitle.style.fontSize = '3rem';
        clonedTitle.style.width = '100%';
    }

    const titleBlockHeight = clonedTitle
        ? Math.ceil(clonedTitle.getBoundingClientRect().height + 36)
        : 0;
    const availableTableHeight = Math.max(
        420,
        EXPORT_TARGET_HEIGHT - (EXPORT_PADDING * 2) - titleBlockHeight
    );

    const tempBodyRows = snapshot.querySelectorAll('.timetable tbody tr').length || 5;
    const headerHeight = 86;
    const rowHeight = Math.max(
        56,
        Math.floor((availableTableHeight - headerHeight) / tempBodyRows)
    );
    const tableHeight = headerHeight + (rowHeight * tempBodyRows);
    const textScale = Math.max(0.85, Math.min(1.05, rowHeight / 125));

    const clonedWrapper = snapshot.querySelector('.timetable-wrapper');
    if (clonedWrapper) {
        clonedWrapper.style.flex = '1 1 auto';
        clonedWrapper.style.width = '100%';
        clonedWrapper.style.maxWidth = 'none';
        clonedWrapper.style.minHeight = '0';
        clonedWrapper.style.height = tableHeight + 'px';
        clonedWrapper.style.maxHeight = tableHeight + 'px';
        clonedWrapper.style.overflow = 'hidden';
    }

    const clonedTable = snapshot.querySelector('.timetable');
    if (clonedTable) {
        clonedTable.style.width = '100%';
        clonedTable.style.height = tableHeight + 'px';
        clonedTable.style.maxWidth = 'none';
        clonedTable.style.minWidth = '0';
        clonedTable.style.tableLayout = 'fixed';
        clonedTable.style.borderCollapse = 'collapse';

        clonedTable.querySelectorAll('th').forEach(th => {
            th.style.fontSize = (1.1 * textScale).toFixed(2) + 'rem';
            th.style.height = headerHeight + 'px';
            th.style.maxHeight = headerHeight + 'px';
            th.style.padding = '10px 8px';
            th.style.overflow = 'hidden';
        });

        clonedTable.querySelectorAll('.day-header, .day-cell').forEach(el => {
            el.style.width = '80px';
            el.style.minWidth = '80px';
            el.style.maxWidth = '80px';
        });

        clonedTable.querySelectorAll('td').forEach(td => {
            td.style.height = rowHeight + 'px';
            td.style.maxHeight = rowHeight + 'px';
            td.style.padding = '6px 8px';
            td.style.overflow = 'hidden';
            td.style.verticalAlign = 'top';
        });

        clonedTable.querySelectorAll('tbody tr').forEach(tr => {
            tr.style.height = rowHeight + 'px';
            tr.style.maxHeight = rowHeight + 'px';
        });

        clonedTable.querySelectorAll('th .time-slot').forEach(el => {
            el.style.fontSize = (0.85 * textScale).toFixed(2) + 'rem';
        });
        clonedTable.querySelectorAll('.course-cell').forEach(el => {
            el.style.height = '100%';
            el.style.padding = '6px 6px';
            el.style.gap = '2px';
            el.style.overflow = 'hidden';
            el.style.justifyContent = 'flex-start';
        });
        clonedTable.querySelectorAll('.course-name').forEach(el => {
            el.style.fontSize = (0.84 * textScale).toFixed(2) + 'rem';
            el.style.marginBottom = '2px';
            el.style.lineHeight = '1.2';
            el.style.maxHeight = '3.6em';
            el.style.whiteSpace = 'normal';
            el.style.wordBreak = 'break-word';
            el.style.overflowWrap = 'anywhere';
            el.style.overflow = 'hidden';
        });
        clonedTable.querySelectorAll('.course-code').forEach(el => {
            el.style.fontSize = (0.76 * textScale).toFixed(2) + 'rem';
            el.style.lineHeight = '1.15';
            el.style.maxHeight = '1.2em';
            el.style.whiteSpace = 'nowrap';
            el.style.overflow = 'hidden';
        });
        clonedTable.querySelectorAll('.course-location').forEach(el => {
            el.style.fontSize = (0.62 * textScale).toFixed(2) + 'rem';
            el.style.lineHeight = '1.2';
            el.style.maxHeight = '2.4em';
            el.style.whiteSpace = 'normal';
            el.style.wordBreak = 'break-word';
            el.style.overflowWrap = 'anywhere';
            el.style.overflow = 'hidden';
        });
        clonedTable.querySelectorAll('.course-lecturer').forEach(el => {
            el.style.fontSize = (0.62 * textScale).toFixed(2) + 'rem';
            el.style.lineHeight = '1.2';
            el.style.maxHeight = '2.4em';
            el.style.whiteSpace = 'normal';
            el.style.wordBreak = 'break-word';
            el.style.overflowWrap = 'anywhere';
            el.style.overflow = 'hidden';
        });
        clonedTable.querySelectorAll('.day-cell').forEach(el => {
            el.style.fontSize = (1.0 * textScale).toFixed(2) + 'rem';
        });
        clonedTable.querySelectorAll('.break-content span').forEach(el => {
            el.style.fontSize = (1.45 * textScale).toFixed(2) + 'rem';
        });
    }

    return { snapshotHost, snapshot };
}

async function renderExportCanvas(exportArea) {
    const { snapshotHost, snapshot } = createExportSnapshot(exportArea);

    try {
        const exportScale = getSafeExportScale(EXPORT_TARGET_WIDTH, EXPORT_TARGET_HEIGHT);
        return await html2canvas(snapshot, getExportConfig(exportScale));
    } finally {
        snapshotHost.remove();
    }
}

async function downloadAsImage() {
    const exportArea = document.getElementById('timetable-export');

    try {
        downloadImageBtn.disabled = true;
        downloadImageBtn.textContent = 'Generating...';

        const canvas = await renderExportCanvas(exportArea);

        if (!canvas || canvas.width === 0 || canvas.height === 0) {
            throw new Error('Failed to generate rendering canvas.');
        }

        // Create download link
        const link = document.createElement('a');
        link.download = `${currentSectionName.replace(/\s+/g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error('Failed to generate image:', error);
        alert('Failed to generate image. Please try again.');
    } finally {
        downloadImageBtn.disabled = false;
        downloadImageBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
            Download as Image
        `;
    }
}

async function downloadAsPdf() {
    const exportArea = document.getElementById('timetable-export');

    try {
        downloadPdfBtn.disabled = true;
        downloadPdfBtn.textContent = 'Generating...';

        const canvas = await renderExportCanvas(exportArea);

        if (!canvas || canvas.width === 0 || canvas.height === 0) {
            throw new Error('Failed to generate rendering canvas.');
        }

        // Calculate PDF dimensions
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = canvas.width;
        const pdfHeight = canvas.height;

        // Use jsPDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [pdfWidth, pdfHeight]
        });

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${currentSectionName.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
        console.error('Failed to generate PDF:', error);
        alert('Failed to generate PDF. Please try again.');
    } finally {
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            Download as PDF
        `;
    }
}
