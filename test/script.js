document.addEventListener('DOMContentLoaded', function() {
    const sidebarItems = document.querySelectorAll('.sidebar__nav-item');
    sidebarItems.forEach(item => {
         item.addEventListener('click', function(){
             sidebarItems.forEach(item => item.classList.remove('active'));
            this.classList.add('active');
         })
    })
    const openModalButton = document.querySelector('.sidebar__footer');
    const modal = document.querySelector('.snipping-tool-modal');
     const closeModalButton = document.querySelector('.snipping-tool-modal__close-icon');
    openModalButton.addEventListener('click', () => {
        modal.classList.add('active');
    });
      closeModalButton.addEventListener('click', () => {
        modal.classList.remove('active');
    });
});