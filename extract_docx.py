from docx import Document

doc = Document(r'c:\Users\akhil teja\Downloads\Paper_Format.docx')
for para in doc.paragraphs:
    print(para.text)