import { React } from "jimu-core";

interface SearchResultsProps {
  loading: boolean;
  error: string | null;
  loadingImage: string;
}

const SearchResults = (props: SearchResultsProps) => {
  const { loading, error, loadingImage } = props;

  return (
    <>
      {loading && (
        <div style={{ textAlign: "center", margin: "8px 0" }}>
          <img src={loadingImage} alt="Loading" />
        </div>
      )}
      {error && <p>{error}</p>}

      <div id="resultsDiv"></div>
    </>
  );
};

export default SearchResults;