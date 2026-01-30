package com.imaginify.repository;

import com.imaginify.model.Book;
import org.springframework.stereotype.Repository;
import software.amazon.awssdk.enhanced.dynamodb.DynamoDbEnhancedClient;
import software.amazon.awssdk.enhanced.dynamodb.DynamoDbTable;
import software.amazon.awssdk.enhanced.dynamodb.Key;
import software.amazon.awssdk.enhanced.dynamodb.TableSchema;

import java.util.List;
import java.util.Optional;

@Repository
public class BookRepository {

    private final DynamoDbTable<Book> bookTable;

    public BookRepository(DynamoDbEnhancedClient enhancedClient) {
        this.bookTable = enhancedClient.table("imaginify-books", TableSchema.fromBean(Book.class));
    }

    public void save(Book book) {
        bookTable.putItem(book);
    }

    public Optional<Book> findById(String bookId) {
        Book book = bookTable.getItem(Key.builder().partitionValue(bookId).build());
        return Optional.ofNullable(book);
    }

    public List<Book> findAll() {
        return bookTable.scan().items().stream().toList();
    }

    public void deleteById(String bookId) {
        bookTable.deleteItem(Key.builder().partitionValue(bookId).build());
    }
}
