const reveals = document.querySelectorAll('.reveal');
const features = document.querySelectorAll('.feature[data-link]');

const observer = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    },
    { threshold: 0.15 }
);

reveals.forEach((el) => observer.observe(el));

features.forEach((feature) => {
    feature.addEventListener('click', () => {
        const target = feature.getAttribute('data-link');
        if (target) {
            window.location.href = target;
        }
    });

    feature.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            feature.click();
        }
    });

    feature.tabIndex = 0;
    feature.setAttribute('role', 'link');
});
