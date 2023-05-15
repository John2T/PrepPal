
  const favoriteButton = document.getElementById('favoriteButton');
  const unfilledIcon = document.getElementById('favIcon');
  const filledIcon = document.getElementById('favIconFilled');

  // Replace this line with your logic to determine if the recipe is favorited
  const isFavorited = true;

  // Toggle the icons based on the favorited state
  if (isFavorited) {
    unfilledIcon.style.display = 'none';
    filledIcon.style.display = 'inline-block';
  } else {
    unfilledIcon.style.display = 'inline-block';
    filledIcon.style.display = 'none';
  }

  // Add an event listener to the favorite button
  favoriteButton.addEventListener('click', () => {
    // Toggle the icons when the button is clicked
    unfilledIcon.style.display = (unfilledIcon.style.display === 'none') ? 'inline-block' : 'none';
    filledIcon.style.display = (filledIcon.style.display === 'none') ? 'inline-block' : 'none';

    // Add your code to handle the favoriting/unfavoriting logic
    // For example, you can make an AJAX request to the server to update the favorited state
  });
