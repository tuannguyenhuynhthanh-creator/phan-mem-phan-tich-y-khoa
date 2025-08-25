import React, { useState, useCallback, DragEvent, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Declare mammoth, pdfjsLib, and mermaid from global scope (loaded via CDN)
declare const mammoth: any;
declare const pdfjsLib: any;
declare const mermaid: any;

type AnalyzableFile = {
  file: File;
  startPage: string;
  endPage: string;
};

type OutputFormat = 'analysis' | 'diagram' | 'table';

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini-api-key') || 'AIzaSyC1JTFkyQCT8h5md0h2zEChyyPepkQx8Ew');
  const [keySaveStatus, setKeySaveStatus] = useState<string>('');
  const [files, setFiles] = useState<AnalyzableFile[]>([]);
  const [userRequest, setUserRequest] = useState<string>('');
  const [analysis, setAnalysis] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('analysis');

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini-api-key');
    if (storedKey) {
      setApiKey(storedKey);
    }
  }, []);
  
  // Effect to render Mermaid diagrams when analysis is available
  useEffect(() => {
    if (outputFormat === 'diagram' && analysis) {
      // Clear previous diagrams
      const container = document.getElementById('mermaid-container');
      if (container) {
        container.innerHTML = ''; // Clear previous content
        try {
          // Mermaid expects the raw code in a div with class 'mermaid'
          const mermaidCode = analysis.replace(/```mermaid|```/g, '').trim();
          const element = document.createElement('div');
          element.className = 'mermaid';
          element.textContent = mermaidCode;
          container.appendChild(element);
          
          mermaid.run({
            nodes: [element]
          });

        } catch (e) {
          console.error("Error rendering mermaid diagram:", e);
          setError("Lỗi: Không thể vẽ sơ đồ. Cú pháp Mermaid do AI tạo ra có thể không hợp lệ.");
        }
      }
    }
  }, [analysis, outputFormat]);


  const handleSaveKey = () => {
    localStorage.setItem('gemini-api-key', apiKey);
    setKeySaveStatus('Đã lưu!');
    setTimeout(() => setKeySaveStatus(''), 2000);
  };
  
  const addFiles = (newFiles: File[]) => {
    const allowedFiles = newFiles
      .filter(f => f.type === 'application/pdf' || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .map(file => ({ file, startPage: '', endPage: '' }));
    setFiles(prev => [...prev, ...allowedFiles]);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addFiles(Array.from(event.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const handlePageRangeChange = (index: number, field: 'startPage' | 'endPage', value: string) => {
    const newFiles = [...files];
    if (/^\d*$/.test(value)) { // Only allow digits
        newFiles[index][field] = value;
        setFiles(newFiles);
    }
  };

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files) {
        addFiles(Array.from(event.dataTransfer.files));
    }
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const extractTextFromFile = async (file: File, startPageStr?: string, endPageStr?: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          if (file.type === 'application/pdf') {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            const startPage = parseInt(startPageStr || '1', 10);
            const endPage = parseInt(endPageStr || `${pdf.numPages}`, 10);

            const firstPage = Math.max(1, startPage);
            const lastPage = Math.min(pdf.numPages, endPage);

            if (firstPage > lastPage) {
              resolve(''); // Return empty string if range is invalid
              return;
            }

            let textContent = '';
            for (let i = firstPage; i <= lastPage; i++) {
              const page = await pdf.getPage(i);
              const text = await page.getTextContent();
              textContent += text.items.map((s: any) => s.str).join(' ');
            }
            resolve(textContent);
          } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ arrayBuffer });
            resolve(result.value);
          } else {
            reject(new Error('Unsupported file type'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };
  
  const handleCopy = () => {
    if (!analysis) return;
    navigator.clipboard.writeText(analysis).then(() => {
        setCopySuccess('Đã sao chép!');
        setTimeout(() => setCopySuccess(''), 2000);
    }, (err) => {
        console.error('Lỗi sao chép: ', err);
        setCopySuccess('Lỗi!');
        setTimeout(() => setCopySuccess(''), 2000);
    });
  };
  
  const createPrompt = (combinedText: string): string => {
    const userRequestPrompt = userRequest 
      ? `Yêu cầu cụ thể từ người dùng là: "${userRequest}". Đây là trọng tâm chính của bạn.`
      : 'Người dùng không có yêu cầu cụ thể, hãy thực hiện một phân tích tổng quan.';

    switch (outputFormat) {
      case 'diagram':
        return `
          **VAI TRÒ:** Bạn là một chuyên gia trực quan hóa dữ liệu AI.
          **MỤC TIÊU:** Phân tích nội dung y khoa được cung cấp và tạo ra một sơ đồ hoặc lưu đồ bằng cú pháp Mermaid.js để tóm tắt các quy trình, mối quan hệ, hoặc các khái niệm chính. ${userRequestPrompt}
          **YÊU CẦU ĐẦU RA:**
          1.  Chỉ trả về khối mã Mermaid, không có bất kỳ văn bản giải thích nào khác.
          2.  Sử dụng loại sơ đồ phù hợp nhất (ví dụ: \`graph TD\` cho lưu đồ, \`mindmap\` cho sơ đồ tư duy).
          3.  Sơ đồ phải rõ ràng, súc tích và trực quan hóa chính xác thông tin từ tài liệu.
          **VÍ DỤ ĐẦU RA:**
          \`\`\`mermaid
          graph TD
              A[Nghiên cứu A] --> B{Phương pháp}
              B --> C[Kết quả]
              A --> D[Đối tượng]
          \`\`\`
          **DỮ LIỆU ĐẦU VÀO:**
          ${combinedText}
        `;
      case 'table':
        return `
          **VAI TRÒ:** Bạn là một nhà phân tích nghiên cứu AI.
          **MỤC TIÊU:** Tạo một bảng so sánh chi tiết bằng định dạng Markdown từ các tài liệu được cung cấp. ${userRequestPrompt}
          **YÊU CẦU ĐẦU RA:**
          1.  Chỉ trả về bảng Markdown, không có văn bản giới thiệu hay kết luận.
          2.  Các cột của bảng nên bao gồm các tài liệu được cung cấp (ví dụ: "Tài liệu A", "Tài liệu B",...).
          3.  Các hàng nên so sánh các tiêu chí quan trọng như: "Mục tiêu nghiên cứu", "Phương pháp luận", "Cỡ mẫu/Đối tượng", "Các phát hiện chính", "Kết luận", "Hạn chế".
          4.  Điền thông tin vào bảng một cách súc tích và chính xác.
          **DỮ LIỆU ĐẦU VÀO:**
          ${combinedText}
        `;
      case 'analysis':
      default:
        return `
          **VAI TRÒ VÀ MỤC TIÊU:**
          Bạn là một chuyên gia phân tích nghiên cứu y khoa AI, có nhiệm vụ tổng hợp thông tin từ nhiều tài liệu để tạo ra một báo cáo phân tích sâu sắc. Đối tượng đọc là các bác sĩ và chuyên gia lâm sàng. Báo cáo của bạn phải có cấu trúc chặt chẽ, mạch lạc, và mang tính học thuật cao.
          **YÊU CẦU CỤ THỂ CỦA NGƯỜI DÙNG (QUAN TRỌNG NHẤT):**
          ${userRequest ? `Người dùng đã đưa ra một yêu cầu phân tích cụ thể. Đây là ưu tiên hàng đầu của bạn. Toàn bộ báo cáo phải được xây dựng để trả lời và làm rõ yêu cầu này: "${userRequest}". Hãy xem đây là lăng kính chính để bạn nhìn nhận và tổng hợp thông tin.` : 'Người dùng không có yêu cầu cụ thể nào. Hãy tiến hành một phân tích tổng quan toàn diện.'}
          **NỘI DUNG PHÂN TÍCH:**
          Dựa trên các tài liệu được cung cấp, hãy tạo ra một bài phân tích duy nhất, mạch lạc bằng **tiếng Việt**, tuyệt đối không tóm tắt từng tài liệu riêng rẽ.
          **CẤU TRÚC VÀ ĐỊNH DẠNG BÁO CÁO (SỬ DỤNG MARKDOWN):**
          ### 1. Tóm tắt tổng quan
          ### 2. Các phát hiện chính được tổng hợp
          ### 3. Phân tích so sánh: Tương đồng và Mâu thuẫn
          ### 4. Thảo luận về phương pháp luận
          ### 5. Kết luận và Ý nghĩa lâm sàng
          **DỮ LIỆU ĐẦU VÀO:**
          ${combinedText}
        `;
    }
  };

  const handleAnalysis = async () => {
    if (files.length === 0) return;

    if (!apiKey) {
      setError("Lỗi: Vui lòng nhập và lưu Google AI API Key của bạn để tiếp tục.");
      return;
    }

    setIsLoading(true);
    setError('');
    setAnalysis('');

    try {
      const fileContents = await Promise.all(
        files.map(async (fileData) => {
          const { file, startPage, endPage } = fileData;
          const text = await extractTextFromFile(file, startPage, endPage);
          const pageRangeInfo = startPage && endPage ? `(từ trang ${startPage} đến ${endPage})` : '';
          return `--- TÀI LIỆU: ${file.name} ${pageRangeInfo} ---\n${text}\n--- KẾT THÚC TÀI LIỆU: ${file.name} ---`;
        })
      );

      const combinedText = fileContents.join('\n\n');
      
      const ai = new GoogleGenAI({ apiKey });
      const prompt = createPrompt(combinedText);

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      setAnalysis(response.text);

    } catch (err: any) {
      console.error('Analysis error:', err);
      if (err.message && (err.message.includes('API key not valid') || err.message.includes('API_KEY_INVALID'))) {
          setError('Lỗi: API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại key bạn đã nhập.');
      } else {
          setError(`Đã xảy ra lỗi trong quá trình phân tích: ${err.message || 'Vui lòng thử lại.'}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <header>
        <h1>Phần mềm phân tích Tài liệu Y khoa</h1>
      </header>
      <main>
        <div className="app-container">
          <div className="panel controls-panel">
            <h2>Bảng điều khiển</h2>
            <p className="panel-subtitle">Bắt đầu bằng bấm Lưu Key, tải lên tài liệu, nhập yêu cầu và nhấn Phân tích.</p>

            <div className="api-key-section">
                <label htmlFor="api-key-input">Google AI API Key</label>
                <div className="api-key-input-wrapper">
                    <input
                        id="api-key-input"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Nhập API Key của bạn tại đây"
                    />
                    <button onClick={handleSaveKey} title="Lưu API Key vào bộ nhớ trình duyệt">
                        {keySaveStatus || 'Lưu Key'}
                    </button>
                </div>
            </div>
            
            <div className="info-box">
              💡 <strong>Mẹo:</strong> Đối với các tài liệu lớn như sách, hãy chỉ định khoảng trang cần phân tích để có kết quả chính xác và nhanh chóng hơn.
            </div>

            <div 
              className={`file-drop-zone ${isDragging ? 'drag-over' : ''}`}
              onClick={() => document.getElementById('file-input')?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input 
                type="file" 
                id="file-input" 
                multiple 
                accept=".pdf,.docx" 
                onChange={handleFileChange} 
              />
              <p>Kéo & thả tệp PDF hoặc DOCX vào đây</p>
              <p>hoặc <a href="#" className="browse-btn" onClick={(e) => e.preventDefault()}>chọn tệp</a></p>
            </div>
            {files.length > 0 && (
              <div>
                <h3>Tệp đã chọn:</h3>
                <ul id="file-list">
                  {files.map((fileData, index) => (
                    <li key={index}>
                      <div className="file-info">
                        <span>{fileData.file.name}</span>
                        {fileData.file.type === 'application/pdf' && (
                          <div className="page-range-inputs">
                            <input
                              type="text"
                              pattern="\d*"
                              placeholder="Từ trang"
                              value={fileData.startPage}
                              onChange={(e) => handlePageRangeChange(index, 'startPage', e.target.value)}
                              aria-label={`Trang bắt đầu cho ${fileData.file.name}`}
                            />
                            <span>-</span>
                            <input
                              type="text"
                              pattern="\d*"
                              placeholder="Đến trang"
                              value={fileData.endPage}
                              onChange={(e) => handlePageRangeChange(index, 'endPage', e.target.value)}
                              aria-label={`Trang kết thúc cho ${fileData.file.name}`}
                            />
                          </div>
                        )}
                      </div>
                      <button className="remove-btn" onClick={() => removeFile(index)}>&times;</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
             <div className="analysis-request">
                <label htmlFor="user-request-input">Yêu cầu phân tích cụ thể (Tùy chọn)</label>
                <textarea
                    id="user-request-input"
                    value={userRequest}
                    onChange={(e) => setUserRequest(e.target.value)}
                    placeholder="ví dụ: tập trung vào kết quả điều trị của bệnh nhân theo độ tuổi"
                    rows={3}
                />
            </div>
             <div className="output-format-selector">
                <label>Chọn định dạng kết quả:</label>
                <div className="radio-group">
                    <label htmlFor="format-analysis">
                        <input type="radio" id="format-analysis" name="outputFormat" value="analysis" checked={outputFormat === 'analysis'} onChange={() => setOutputFormat('analysis')} />
                        Báo cáo Phân tích
                    </label>
                    <label htmlFor="format-diagram">
                        <input type="radio" id="format-diagram" name="outputFormat" value="diagram" checked={outputFormat === 'diagram'} onChange={() => setOutputFormat('diagram')} />
                        Sơ đồ / Lưu đồ
                    </label>
                    <label htmlFor="format-table">
                        <input type="radio" id="format-table" name="outputFormat" value="table" checked={outputFormat === 'table'} onChange={() => setOutputFormat('table')} />
                        Bảng so sánh
                    </label>
                </div>
            </div>
            <button 
              className="analyze-btn" 
              onClick={handleAnalysis} 
              disabled={!apiKey || files.length === 0 || isLoading}
            >
              {isLoading ? 'Đang phân tích...' : 'Phân tích Tài liệu'}
            </button>
          </div>
          <div className="panel output-panel">
            <h2>Kết quả Phân tích</h2>
            {isLoading && (
              <div className="loader-container">
                <div className="loader"></div>
                <p>AI đang tổng hợp và phân tích... <br/>Việc này có thể mất một chút thời gian.</p>
              </div>
            )}
            {error && <p className="error-message">{error}</p>}
            {!isLoading && !error && !analysis && (
              <p className="placeholder">Nhập API Key, tải lên tài liệu PDF hoặc DOCX và nhấn "Phân tích" để xem kết quả tổng hợp tại đây.</p>
            )}
            {analysis && (
                <div className="output-wrapper">
                    <button onClick={handleCopy} className="copy-btn">
                        {copySuccess || 'Sao chép'}
                    </button>
                    <div className="output-content">
                       {outputFormat === 'diagram' ? (
                          <div id="mermaid-container"></div>
                       ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
                       )}
                    </div>
                </div>
            )}
          </div>
        </div>
      </main>
      <footer className="app-footer">
        <span>Sâu lười ham học</span>
      </footer>
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);