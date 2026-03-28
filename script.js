const contactBtns = document.querySelectorAll(".contactBtn");
const contactForm = document.getElementById("contactFormDiv");
contactBtns.forEach(contactBtn => {
  contactBtn.addEventListener("click", e => {
    contactForm.scrollIntoView();
    console.log(e.target);
  });
});
