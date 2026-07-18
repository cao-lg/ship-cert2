import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Upload from "@/pages/Upload";
import Annotate from "@/pages/Annotate";
import Export from "@/pages/Export";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Upload />} />
        <Route path="/annotate" element={<Annotate />} />
        <Route path="/export" element={<Export />} />
      </Routes>
    </Router>
  );
}
