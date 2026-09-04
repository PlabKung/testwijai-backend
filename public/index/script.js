document.addEventListener('DOMContentLoaded', () => {

    // Handle Category Clicks (Visual only for now)
    const categoryItems = document.querySelectorAll('.category-item');
    categoryItems.forEach(item => {
        item.addEventListener('click', () => {
            categoryItems.forEach(c => c.classList.remove('active'));
            item.classList.add('active');
        });
    });

});
