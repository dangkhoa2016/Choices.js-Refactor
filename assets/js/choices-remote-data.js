class ChoicesRemoteData {
  constructor(selectElement, options) {
    options = options || {};
    let {
      fetchUrl,
      itemsPerPage = 10,
      minSearchLength = 1,
      loadDataOnStart = true,
      disabled,
      onChange,
      onInit,
      searchHintClass = 'search-hint',
    } = options;
    
    minSearchLength = parseInt(minSearchLength, 10) || 1;
    itemsPerPage = parseInt(itemsPerPage, 10) || 10;

    const defaults = {
      fetchUrl: null,
      itemsPerPage: 10,
      minSearchLength: 1,
      loadDataOnStart: true,
      disabled: false,
      onChange: null,
      onInit: null,
      searchHintClass: 'search-hint',
    }
    this.options = Object.assign({}, defaults, {
      fetchUrl,
      itemsPerPage,
      minSearchLength,
      loadDataOnStart,
      disabled,
      onChange,
      onInit,
      searchHintClass,
    });

    if (!selectElement || !this.options.fetchUrl) {
      throw new Error('selectElement and fetchUrl are required');
    }

    let element;
    
    if (typeof selectElement === 'string')
      element = document.querySelector(selectElement);
    else
      element = selectElement;

    if (!element)
      throw new Error('Select element not found');

    this.currentPage = 1;
    this.isLoading = false;
    this.hasMoreData = true;
    this.triggerSearch = false;
    this.keyword = '';
    this.previousKeyword = '';
    this.choices = null;
    this.searchHintText = `Enter at least ${this.options.minSearchLength} character(s)`;

    this.initializeChoices(element);
  }

  // Fetch data from the server
  fetchDataFromServer() {
    const query = `page=${this.currentPage}&per_page=${this.options.itemsPerPage}&keyword=${this.keyword || ''}`;
    const fetchUrlHasQuery = this.options.fetchUrl.includes('?');
    const url = `${this.options.fetchUrl}${fetchUrlHasQuery ? '&' : '?'}${query}`;
    return fetch(url)
      .then(response => response.json())
      .then(data => {
        if (data.length < this.options.itemsPerPage)
          this.hasMoreData = false;

        this.isLoading = false;
        this.previousKeyword = this.keyword;
        this.triggerSearch = false;

        const currentSelectedValues = this.choices?.getValue(true) || [];

        return data.map(item => ({
          value: item.value,
          label: item.label,
          disabled: currentSelectedValues.includes(item.value),
        }));
      })
      .catch(error => {
        this.isLoading = false;
        console.error('Error fetching data:', error);
        return [];
      });
  }

  updateFetchUrl(url) {
    // console.log('updateFetchUrl', url);
    if (url) {
      this.triggerSearch = true;
      this.hasMoreData = true;
    } else {
      this.triggerSearch = false;
      this.hasMoreData = false;
    }

    this.options.fetchUrl = url;
    this.currentPage = 1;
    this.keyword = '';
    this.clearSelection(true);
  }

  enableSelect() {
    if (this.choices)
      this.choices.enable();
  }

  disableSelect() {
    if (this.choices) {
      this.choices.disable();
      this.choices.containerOuter.removeFocusState();
    }
  }

  clearAllOptions() {
    if (this.choices)
      this.choices.clearChoices();
  }

  clearSelection(clearOptions = false) {
    if (this.choices) {
      const values = [].concat(this.choices.getValue(true));
      values.forEach(value => {
        this.choices.removeChoice(value);
      });
      if (clearOptions)
        this.clearAllOptions();
    }
  }

  // Initialize the Choices.js select element and bind event listeners
  initializeChoices(element) {
    if (!element || this.choices)
      return;
    
    const t = this;
    t.fetchDataFromServer = t.fetchDataFromServer.bind(t);

    t.addSearchHintOptionToElement(element);

    new Choices(element, {
      resetScrollPosition: false,
      searchChoices: false,
      searchFloor: t.options.minSearchLength,
      shouldSort: false,
      classNames: {
        containerOuter: ['choices', 'mt-2'],
        placeholder: ['choices__placeholder', 'text-secondary'],
      },
      removeItemButton: true,
      callbackOnInit: function () {
        t.initializeChoicesCallback(this);
        if (t.options.onInit)
          t.options.onInit(t, this);
        if (t.options.disabled) {
          this.disable();
          return;
        }

        if (t.options.loadDataOnStart && t.options.fetchUrl) {
          t.triggerSearch = false;
          this.setChoices(t.fetchDataFromServer, 'value', 'label', true);
        }
        else if (t.options.fetchUrl)
          t.triggerSearch = true;
      },
    });
  }

  // Add search hint option to the select element
  addSearchHintOptionToElement(element) {
    if (!element)
      return;

    const searchHintOption = document.createElement('option');
    searchHintOption.classList.add(this.options.searchHintClass);
    searchHintOption.innerText = this.searchHintText;
    searchHintOption.setAttribute('data-label-class', this.options.searchHintClass);
    searchHintOption.setAttribute('disabled', 'disabled');
    element.appendChild(searchHintOption);
  }

  // Handle the search functionality
  handleSearchInput(event) {
    this.keyword = event.target.value;
    if (this.keyword.length === 0) {
      // check if user press backspace key or delete key
      if (event.keyCode === 8 || event.keyCode === 46) {
        // console.log('backspace or delete key pressed', event.keyCode);
        if (this.previousKeyword) {
          this.previousKeyword = '';
        }
        else {
          return;
        }
      }

      this.hideSearchHintMessage();

      this.currentPage = 1;
      this.hasMoreData = true;
      this.triggerSearch = false;
      this.loadOptionItemsWithSearchHint();
      return;
    }

    if (this.keyword.length < this.options.minSearchLength) {
      this.toggleSelectableItemsVisibility('none');
      this.displaySearchHint(this.searchHintText);
      return;
    }

    this.currentPage = 1;
    this.hasMoreData = true;
    this.triggerSearch = true;
    this.loadOptionItemsWithSearchHint(true);
  }

  handleKeyUpInput = (event) => {
    if (this.handleKeyUpInput.timeout)
      clearTimeout(this.handleKeyUpInput.timeout);

    this.handleKeyUpInput.timeout = setTimeout(() => {
      this.handleSearchInput(event);
    }, 300);
  };

  // Initialize choices callback to handle scroll and search hint
  initializeChoicesCallback(choicesInstance) {
    choicesInstance.choiceList.element.addEventListener('scroll', this.checkIfDropdownScrolledToBottom.bind(this));

    choicesInstance.passedElement.element.addEventListener('hideDropdown', () => {
      choicesInstance.choiceList.scrollToTop();
    });

    choicesInstance.passedElement.element.addEventListener('removeItem', (ev) => {
      // this.choices.refresh();
      var removedItemIndex = this.choices._store._state.choices.findIndex(item => item.value === ev.detail.value);
      if (removedItemIndex === -1)
        return;

      this.choices._store._state.choices[removedItemIndex].disabled = false;
      if (this.choices._store._state.choices[removedItemIndex].choiceEl) {
        this.choices._store._state.choices[removedItemIndex].choiceEl.remove();
        delete this.choices._store._state.choices[removedItemIndex].choiceEl;
      }
    });

    choicesInstance.passedElement.element.addEventListener('change', () => {
      if (this.keyword) {
        this.currentPage = 1;
        this.keyword = this.choices.input.element.value;
        this.triggerSearch = true;
        this.hasMoreData = true;
      }

      if (this.options.onChange)
        this.options.onChange(choicesInstance.getValue());
    });

    choicesInstance.passedElement.element.addEventListener('showDropdown', () => {
      if (this.keyword.length > 0 && this.keyword.length < this.options.minSearchLength)
        return;

      if (this.triggerSearch) {
        this.triggerSearch = false;
        this.loadOptionItemsWithSearchHint();
      }
    });

    choicesInstance.input.element.addEventListener('keyup', this.handleKeyUpInput);

    this.choices = choicesInstance;
    this.cacheSearchHintElement = choicesInstance._store.state.choices.find(item => item.labelClass?.includes(this.options.searchHintClass))?.choiceEl;
  }

  // Check if the dropdown is scrolled to the bottom and load more data
  checkIfDropdownScrolledToBottom() {
    if (!this.hasMoreData) {
      return;
    }

    const scrollableElement = this.choices.choiceList.element;
    const scrollPosition = (scrollableElement.scrollHeight - scrollableElement.scrollTop - scrollableElement.clientHeight);
    const bottomOfDropdown = scrollPosition < 30;
    if (bottomOfDropdown && !this.isLoading) {
      this.isLoading = true;
      this.currentPage++;

      this.choices.setChoices(this.fetchDataFromServer, 'value', 'label', false).then(() => {
        this.choices.input.element.focus();
      });
    }
  }

  // Show the search hint message
  displaySearchHint(message) {
    let hintElement = this.choices.choiceList.element.querySelector(`[data-label-class='${this.options.searchHintClass}']`);
    if (!hintElement) {
      this.choices.choiceList.element.children[0].style.display = 'none';
      this.choices.choiceList.element.appendChild(this.cacheSearchHintElement);
      hintElement = this.choices.choiceList.element.querySelector(`[data-label-class='${this.options.searchHintClass}']`);
    }

    const hintText = hintElement.querySelector(`.${this.options.searchHintClass}`);
    hintElement.style.display = 'block';
    hintText.innerText = message;
    hintText.style.display = 'block';
  }

  // Hide the search hint message
  hideSearchHintMessage() {
    const hintElement = this.choices.choiceList.element.querySelector(`[data-label-class='${this.options.searchHintClass}']`);
    if (hintElement)
      hintElement.style.display = 'none';
  }

  // Toggle the visibility of selectable items
  toggleSelectableItemsVisibility(displayStyle) {
    const items = this.choices.choiceList.element.querySelectorAll(`:not([data-label-class='${this.options.searchHintClass}']`);
    if (!items)
      return;

    items.forEach(item => {
      item.style.display = displayStyle;
    });
  }

  // Load option items with search hint in the dropdown
  loadOptionItemsWithSearchHint(displaySearchHint = false) {
    this.choices._store._state.choices = this.choices._store._state.choices.filter(item => item.labelClass?.includes(this.options.searchHintClass));
    this.choices.passedElement.element.querySelectorAll(`:not([data-label-class='${this.options.searchHintClass}'],[selected])`).forEach(item => item.remove());
    this.toggleSelectableItemsVisibility('none');
    setTimeout(() => {
      this.displaySearchHint(displaySearchHint ? `Searching for "${this.keyword}"...` : 'Loading...');
    }, 0);

    this.choices.setChoices(this.fetchDataFromServer, 'value', 'label', displaySearchHint ? false : true).then(() => {
      this.hideSearchHintMessage();
      if (displaySearchHint && this.choices._isSelectMultipleElement) {
        this.choices.itemList.element.replaceChildren('');
        this.choices._render();
      }
      this.choices.input.element.focus();
    });
  }
}
