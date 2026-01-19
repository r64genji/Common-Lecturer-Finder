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
    try {
        const response = await fetch('/api/sections');
        const data = await response.json();

        data.sections.forEach(section => {
            const option = document.createElement('option');
            option.value = section;
            option.textContent = `Section ${section}`;
            sectionSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load sections:', error);
    }
}

function setupEventListeners() {
    // Section select
    sectionSelect.addEventListener('change', async (e) => {
        if (e.target.value) {
            await loadTimetable(e.target.value);
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

async function loadTimetable(section) {
    showLoading();

    try {
        const response = await fetch(`/api/timetable/${section}`);
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

async function downloadAsImage() {
    const exportArea = document.getElementById('timetable-export');

    try {
        downloadImageBtn.disabled = true;
        downloadImageBtn.textContent = 'Generating...';

        // Capture the export area (title + table only)
        const canvas = await html2canvas(exportArea, {
            backgroundColor: '#0f0f1a',
            scale: 2,
            useCORS: true,
            logging: false,
            windowWidth: 1600, // Pretend we are on a large screen
            onclone: (clonedDoc) => {
                const clonedExport = clonedDoc.getElementById('timetable-export');
                if (clonedExport) {
                    // Force desktop width and ensure visibility
                    clonedExport.style.width = '1400px';
                    clonedExport.style.maxWidth = 'none';
                    clonedExport.style.overflow = 'visible';
                    // Ensure the container allows expanding
                    const container = clonedDoc.querySelector('.timetable-container');
                    if (container) container.style.width = '1400px';

                    // Force table to respect min-widths
                    const table = clonedDoc.getElementById('timetable');
                    if (table) table.style.width = '100%';
                }
            }
        });

        // Ensure 16:9 aspect ratio while keeping ALL content visible
        const targetRatio = 16 / 9;
        const currentRatio = canvas.width / canvas.height;

        let finalCanvas = canvas;

        if (Math.abs(currentRatio - targetRatio) > 0.01) {
            // Create a new canvas with exact 16:9 ratio
            finalCanvas = document.createElement('canvas');
            const ctx = finalCanvas.getContext('2d');

            let newWidth, newHeight;

            if (currentRatio > targetRatio) {
                // Content is wider than 16:9 - use content width, expand height
                newWidth = canvas.width;
                newHeight = Math.round(newWidth / targetRatio);
            } else {
                // Content is taller than 16:9 - use content height, expand width
                newHeight = canvas.height;
                newWidth = Math.round(newHeight * targetRatio);
            }

            finalCanvas.width = newWidth;
            finalCanvas.height = newHeight;

            // Fill with background color
            ctx.fillStyle = '#0f0f1a';
            ctx.fillRect(0, 0, newWidth, newHeight);

            // Center the original canvas content
            const xOffset = Math.round((newWidth - canvas.width) / 2);
            const yOffset = Math.round((newHeight - canvas.height) / 2);
            ctx.drawImage(canvas, xOffset, yOffset);
        }

        // Create download link
        const link = document.createElement('a');
        link.download = `${currentSectionName.replace(/\s+/g, '_')}.png`;
        link.href = finalCanvas.toDataURL('image/png');
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

        // Capture the export area (title + table only)
        const canvas = await html2canvas(exportArea, {
            backgroundColor: '#0f0f1a',
            scale: 2,
            useCORS: true,
            logging: false,
            windowWidth: 1600, // Pretend we are on a large screen
            onclone: (clonedDoc) => {
                const clonedExport = clonedDoc.getElementById('timetable-export');
                if (clonedExport) {
                    // Force desktop width and ensure visibility
                    clonedExport.style.width = '1400px';
                    clonedExport.style.maxWidth = 'none';
                    clonedExport.style.overflow = 'visible';
                    // Ensure the container allows expanding
                    const container = clonedDoc.querySelector('.timetable-container');
                    if (container) container.style.width = '1400px';

                    // Force table to respect min-widths
                    const table = clonedDoc.getElementById('timetable');
                    if (table) table.style.width = '100%';
                }
            }
        });

        // Ensure 16:9 aspect ratio while keeping ALL content visible
        const targetRatio = 16 / 9;
        const currentRatio = canvas.width / canvas.height;

        let finalCanvas = canvas;

        if (Math.abs(currentRatio - targetRatio) > 0.01) {
            finalCanvas = document.createElement('canvas');
            const ctx = finalCanvas.getContext('2d');

            let newWidth, newHeight;

            if (currentRatio > targetRatio) {
                // Content is wider than 16:9 - use content width, expand height
                newWidth = canvas.width;
                newHeight = Math.round(newWidth / targetRatio);
            } else {
                // Content is taller than 16:9 - use content height, expand width
                newHeight = canvas.height;
                newWidth = Math.round(newHeight * targetRatio);
            }

            finalCanvas.width = newWidth;
            finalCanvas.height = newHeight;

            ctx.fillStyle = '#0f0f1a';
            ctx.fillRect(0, 0, newWidth, newHeight);

            const xOffset = Math.round((newWidth - canvas.width) / 2);
            const yOffset = Math.round((newHeight - canvas.height) / 2);
            ctx.drawImage(canvas, xOffset, yOffset);
        }

        // Calculate PDF dimensions (landscape 16:9)
        const imgData = finalCanvas.toDataURL('image/png');
        const pdfWidth = finalCanvas.width;
        const pdfHeight = finalCanvas.height;

        // Use jsPDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'px',
            format: [pdfWidth / 2, pdfHeight / 2]
        });

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth / 2, pdfHeight / 2);
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
