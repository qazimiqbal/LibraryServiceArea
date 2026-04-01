import { React } from "jimu-core";

interface SearchFormProps {
  addressInput: string;
  hasResults: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onAddressInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSearchClick: () => void;
  onClearClick: () => void;
}

const SearchForm = (props: SearchFormProps) => {
  const {
    addressInput,
    hasResults,
    onSubmit,
    onAddressInputChange,
    onSearchClick,
    onClearClick,
  } = props;

  return (
    <>
      <form onSubmit={onSubmit}>
        <div className="parent">
          <div className="child1">
            <input
              className="input-text"
              type="text"
              placeholder="141 Pryor st"
              value={addressInput}
              onChange={onAddressInputChange}
              aria-label="Enter address to search"
              title="Enter address to search"
            />
          </div>
          <div className="child2">
            <button
              className="toggle-icon"
              type="button"
              onClick={onSearchClick}
              aria-label="Search for address"
              title="Search for address"
            >
              Search
            </button>
          </div>
          {hasResults && (
            <div className="clearDiv">
              <button
                type="button"
                onClick={onClearClick}
                aria-label="Clear search results"
                title="Clear search results"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </form>
      <hr style={{ color: "gray" }} />
    </>
  );
};

export default SearchForm;