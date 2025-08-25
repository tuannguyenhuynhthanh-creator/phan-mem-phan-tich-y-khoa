import React, { useState, useCallback, DragEvent, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Declare mammoth and pdfjsLib from global scope (loaded via CDN)
declare const mammoth: any;
declare const pdfjsLib: any;

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('gemini-api-key') || 'AIzaSyAyAoSJdnxjCzUDZbg3jIvPH8h_uLRyWTY');
  const [keySaveStatus, setKeySaveStatus] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [userRequest, setUserRequest] = useState<string>('');
  const [analysis, setAnalysis] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<string>('');

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini-api-key');
    if (storedKey) {
      setApiKey(storedKey);
    }
  }, []);

  const handleSaveKey = () => {
    localStorage.setItem('gemini-api-key', apiKey);
    setKeySaveStatus('Đã lưu!');
    setTimeout(() => setKeySaveStatus(''), 2000);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files);
      setFiles(prev => [...prev, ...newFiles.filter((f: File) => f.type === 'application/pdf' || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files) {
        const newFiles = Array.from(event.dataTransfer.files);
        setFiles(prev => [...prev, ...newFiles.filter((f: File) => f.type === 'application/pdf' || f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')]);
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

  const extractTextFromFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          if (file.type === 'application/pdf') {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let textContent = '';
            for (let i = 1; i <= pdf.numPages; i++) {
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
        files.map(async (file) => {
          const text = await extractTextFromFile(file);
          return `--- TÀI LIỆU: ${file.name} ---\n${text}\n--- KẾT THÚC TÀI LIỆU: ${file.name} ---`;
        })
      );

      const combinedText = fileContents.join('\n\n');
      
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
        **VAI TRÒ VÀ MỤC TIÊU:**
        Bạn là một chuyên gia phân tích nghiên cứu y khoa AI, có nhiệm vụ tổng hợp thông tin từ nhiều tài liệu để tạo ra một báo cáo phân tích sâu sắc. Đối tượng đọc là các bác sĩ và chuyên gia lâm sàng. Báo cáo của bạn phải có cấu trúc chặt chẽ, mạch lạc, và mang tính học thuật cao.

        **YÊU CẦU CỤ THỂ CỦA NGƯỜI DÙNG (QUAN TRỌNG NHẤT):**
        ${userRequest ? `Người dùng đã đưa ra một yêu cầu phân tích cụ thể. Đây là ưu tiên hàng đầu của bạn. Toàn bộ báo cáo phải được xây dựng để trả lời và làm rõ yêu cầu này: "${userRequest}". Hãy xem đây là lăng kính chính để bạn nhìn nhận và tổng hợp thông tin.` : 'Người dùng không có yêu cầu cụ thể nào. Hãy tiến hành một phân tích tổng quan toàn diện.'}

        **NỘI DUNG PHÂN TÍCH:**
        Dựa trên các tài liệu được cung cấp, hãy thực hiện các công việc sau:
        1.  **Tổng hợp toàn diện:** Trích xuất và kết hợp các phát hiện chính, dữ liệu định lượng/định tính, phương pháp nghiên cứu, và kết luận từ TẤT CẢ các tài liệu.
        2.  **Phân tích so sánh:** Xác định và thảo luận rõ ràng về các điểm tương đồng (sự đồng thuận), khác biệt (mâu thuẫn), và các khía cạnh độc đáo hoặc bổ sung cho nhau giữa các tài liệu. Đừng chỉ liệt kê, hãy phân tích tại sao những điểm này lại quan trọng.
        3.  **Tạo ra một bài phân tích duy nhất:** Tuyệt đối không tóm tắt từng tài liệu một cách riêng rẽ. Thay vào đó, hãy dệt các thông tin lại với nhau thành một bài phân tích tổng hợp, mạch lạc và có dòng chảy logic.

        **CẤU TRÚC VÀ ĐỊNH DẠNG BÁO CÁO:**
        Toàn bộ nội dung phân tích phải được viết bằng **tiếng Việt**.
        Hãy trình bày kết quả dưới dạng một báo cáo có cấu trúc rõ ràng, sử dụng định dạng Markdown. Cấu trúc gợi ý như sau:

        ### 1. Tóm tắt tổng quan
        (Một đoạn văn ngắn gọn nêu bật những kết luận quan trọng nhất từ bài phân tích tổng hợp, đặc biệt là những điểm liên quan đến yêu cầu của người dùng.)

        ### 2. Các phát hiện chính được tổng hợp
        (Trình bày các kết quả cốt lõi từ các nghiên cứu. Nhóm các phát hiện tương tự lại với nhau và trích dẫn (ví dụ: [Tài liệu A, B]) khi cần thiết.)

        ### 3. Phân tích so sánh: Tương đồng và Mâu thuẫn
        (Phần này dành riêng để so sánh các tài liệu.
        - **Điểm tương đồng:** Nêu bật các kết luận hoặc dữ liệu được củng cố trên nhiều nguồn.
        - **Điểm mâu thuẫn/khác biệt:** Chỉ ra những nơi các tài liệu đưa ra kết quả trái ngược hoặc khác nhau và thảo luận về các nguyên nhân có thể.)

        ### 4. Thảo luận về phương pháp luận
        (Tóm tắt ngắn gọn các phương pháp được sử dụng trong các tài liệu và nhận xét về bất kỳ điểm mạnh hoặc hạn chế nào có thể ảnh hưởng đến kết quả.)

        ### 5. Kết luận và Ý nghĩa lâm sàng
        (Đưa ra kết luận cuối cùng dựa trên toàn bộ bằng chứng. Quan trọng nhất, hãy giải thích ý nghĩa thực tiễn của những phát hiện này đối với các bác sĩ lâm sàng.)

        **DỮ LIỆU ĐẦU VÀO:**
        Đây là nội dung được trích xuất từ các tài liệu:
        ${combinedText}
      `;

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
                  {files.map((file, index) => (
                    <li key={index}>
                      <span>{file.name}</span>
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
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