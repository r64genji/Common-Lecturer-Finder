/**
 * Timetable Section Comparison App
 */

document.addEventListener('DOMContentLoaded', () => {
    const sectionSelect = document.getElementById('section-select');
    const resultsContainer = document.getElementById('results');
    const loadingEl = document.getElementById('loading');
    const statsBar = document.getElementById('stats-bar');
    const totalCoursesEl = document.getElementById('total-courses');
    const sharedCountEl = document.getElementById('shared-count');

    // Load available sections
    loadSections();

    // Handle section selection change
    sectionSelect.addEventListener('change', (e) => {
        const sectionId = e.target.value;
        if (sectionId) {
            loadSharedLecturers(sectionId);
        } else {
            showEmptyState();
        }
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

    async function loadSharedLecturers(sectionId) {
        showLoading();

        try {
            const response = await fetch(`/api/shared-lecturers/${sectionId}`);
            const data = await response.json();

            hideLoading();
            renderResults(data);
        } catch (error) {
            console.error('Failed to load data:', error);
            hideLoading();
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">❌</div>
                    <p class="empty-state-text">Failed to load data. Please try again.</p>
                </div>
            `;
        }
    }

    function renderResults(data) {
        const courses = data.courses;

        if (!courses || courses.length === 0) {
            showEmptyState('No courses found for this section');
            return;
        }

        // Calculate stats
        const totalCourses = courses.length;
        const totalShared = courses.reduce((sum, c) => sum + c.shared_sections.length, 0);

        // Show stats bar
        statsBar.style.display = 'flex';
        totalCoursesEl.textContent = totalCourses;
        sharedCountEl.textContent = totalShared;

        // Render course cards
        resultsContainer.innerHTML = courses.map((course, index) => `
            <div class="course-card" style="animation-delay: ${index * 0.05}s">
                <div class="course-name">${course.course_name}</div>
                <div class="lecturer-name">${course.lecturer_name}</div>
                <div class="shared-sections">
                    ${course.shared_sections.length > 0
                ? `<span class="shared-label">Shared with:</span>
                           ${course.shared_sections.map(s =>
                    `<span class="section-badge">Section ${s}</span>`
                ).join('')}`
                : '<span class="no-shared">No other sections share this lecturer</span>'
            }
                </div>
            </div>
        `).join('');
    }

    function showEmptyState(message = 'Select a section to see shared lecturers') {
        statsBar.style.display = 'none';
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <p class="empty-state-text">${message}</p>
            </div>
        `;
    }

    function showLoading() {
        loadingEl.classList.add('active');
        resultsContainer.style.display = 'none';
        statsBar.style.display = 'none';
    }

    function hideLoading() {
        loadingEl.classList.remove('active');
        resultsContainer.style.display = 'flex';
    }
});
